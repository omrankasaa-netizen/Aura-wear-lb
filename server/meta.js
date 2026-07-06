// Server-side Meta integration for AURA: catalog feed builder + Conversions API
// (CAPI) sender. Everything is env-driven and degrades to a safe no-op when the
// relevant env vars are unset, so the site runs with zero Meta config.
//
//   AURA_META_PIXEL_ID           dataset / pixel id (required for CAPI)
//   AURA_META_CAPI_ACCESS_TOKEN  CAPI access token — SECRET, backend only
//   AURA_META_TEST_EVENT_CODE    optional; routes events to the Test Events tab
//   AURA_PUBLIC_BASE_URL         public site origin used for feed links
//
// The catalog feed needs no secrets and no env vars — it always works.

import crypto from 'node:crypto';

const DEFAULT_BASE_URL = 'https://aura-lb.shop';
const CURRENCY = 'USD';
const GRAPH_VERSION = 'v19.0';

export function publicBaseUrl() {
  return (process.env.AURA_PUBLIC_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

// Normalize a SKU identically to the browser pixel (uppercase + trim) so pixel
// content_ids match the feed ids — Meta catalog matching is case-sensitive.
export function normalizeSku(sku) {
  return String(sku ?? '').trim().toUpperCase();
}

// Turn a possibly-relative image/link path into an absolute URL.
export function absoluteUrl(pathOrUrl, base = publicBaseUrl()) {
  const v = String(pathOrUrl ?? '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `${base}${v.startsWith('/') ? '' : '/'}${v}`;
}

function money(n) {
  return `${Number(n || 0).toFixed(2)} ${CURRENCY}`;
}

// Map the store's gender values to the Meta catalog vocabulary.
function metaGender(gender) {
  const g = String(gender || '').toLowerCase();
  if (g.startsWith('men') || g === 'male' || g === 'boys') return 'male';
  if (g.startsWith('women') || g === 'female' || g === 'girls') return 'female';
  if (g === 'unisex') return 'unisex';
  return '';
}

function metaAgeGroup(age) {
  const a = String(age || '').toLowerCase();
  if (!a) return '';
  if (a.startsWith('adult')) return 'adult';
  if (a.startsWith('newborn')) return 'newborn';
  if (a.startsWith('infant')) return 'infant';
  if (a.startsWith('toddler')) return 'toddler';
  if (a.startsWith('kid') || a.startsWith('child')) return 'kids';
  return '';
}

function firstPiped(value) {
  const parts = String(value || '').split('|').map((s) => s.trim()).filter(Boolean);
  return parts.length === 1 ? parts[0] : ''; // only emit when unambiguous
}

// Column order for the Google/Meta-style catalog CSV.
export const FEED_COLUMNS = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price',
  'link', 'image_link', 'brand', 'gender', 'age_group', 'size', 'color',
];

// Build a single feed row object from a product plus resolved context
// (absolute image url + computed stock). Pure + easily testable.
export function buildFeedRow(product, ctx = {}) {
  const { base = publicBaseUrl(), imageUrl = '', inStock = true } = ctx;
  const id = normalizeSku(product.sku || product.slug || product.id);
  const price = Number(product.price_usd || 0);
  const compareAt = Number(product.compare_at_price_usd || 0);
  const onSale = compareAt > price && price > 0;

  const title = product.name || product.slug || id;
  const description =
    product.description || product.short_description || title;

  return {
    id,
    title,
    description,
    availability: inStock ? 'in stock' : 'out of stock',
    condition: 'new',
    // On sale: price = original (compare-at), sale_price = current. Otherwise
    // price = current and sale_price is empty.
    price: money(onSale ? compareAt : price),
    sale_price: onSale ? money(price) : '',
    link: `${base}/product/${product.slug || id}`,
    image_link: imageUrl || `${base}/brand/aura-icon-512.png`,
    brand: 'AURA',
    gender: metaGender(product.gender),
    age_group: metaAgeGroup(product.age_group),
    size: firstPiped(product.sizes),
    color: firstPiped(product.colors),
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Serialize an array of row objects to a CSV string with the standard header.
export function buildFeedCsv(rows) {
  const header = FEED_COLUMNS.join(',');
  const lines = rows.map((r) => FEED_COLUMNS.map((c) => csvEscape(r[c])).join(','));
  return [header, ...lines].join('\n') + '\n';
}

// ─── Conversions API ─────────────────────────────────────────────────────────

export function isCapiConfigured() {
  return !!(process.env.AURA_META_PIXEL_ID && process.env.AURA_META_CAPI_ACCESS_TOKEN);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Meta requires PII (email/phone) hashed, normalized (trimmed + lowercased),
// email as-is lowercased, phone digits only.
function hashEmail(email) {
  const v = String(email || '').trim().toLowerCase();
  return v ? sha256(v) : undefined;
}

function hashPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? sha256(digits) : undefined;
}

// Build the CAPI Purchase payload from an order + its items. Exported for tests.
export function buildPurchasePayload(order, items, opts = {}) {
  const {
    eventId = order.id,
    eventSourceUrl = `${publicBaseUrl()}/checkout`,
    now = Math.floor(Date.now() / 1000),
  } = opts;

  const contents = (items || []).map((it) => ({
    id: normalizeSku(it.sku || it.product_id),
    quantity: Number(it.quantity || 1),
    item_price: Number(it.unit_price_usd || 0),
  }));

  const userData = {};
  const em = hashEmail(order.customer_email);
  const ph = hashPhone(order.customer_phone);
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];

  const event = {
    event_name: 'Purchase',
    event_time: now,
    event_id: eventId,
    action_source: 'website',
    event_source_url: eventSourceUrl,
    user_data: userData,
    custom_data: {
      currency: CURRENCY,
      value: Number(order.grand_total_usd || 0),
      order_id: order.order_number || order.id,
      content_type: 'product',
      content_ids: contents.map((c) => c.id),
      contents,
      num_items: contents.reduce((s, c) => s + c.quantity, 0),
    },
  };

  const payload = { data: [event] };
  if (process.env.AURA_META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.AURA_META_TEST_EVENT_CODE;
  }
  return payload;
}

// Send a Purchase event to the Conversions API. Silent no-op when unconfigured.
// Returns { sent: boolean, skipped?, status?, error? }.
export async function sendPurchaseCapi(order, items, opts = {}) {
  if (!isCapiConfigured()) return { sent: false, skipped: 'not_configured' };
  const pixelId = process.env.AURA_META_PIXEL_ID;
  const token = process.env.AURA_META_CAPI_ACCESS_TOKEN;
  const payload = buildPurchasePayload(order, items, opts);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { sent: false, status: res.status, error: text.slice(0, 500) };
    }
    return { sent: true, status: res.status };
  } catch (e) {
    return { sent: false, error: e?.message || 'capi request failed' };
  }
}
