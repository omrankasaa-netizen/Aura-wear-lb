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
const GRAPH_VERSION = 'v21.0';

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

// Meta requires PII hashed after normalization: email trimmed + lowercased,
// phone digits only with country code (bare Lebanese numbers get 961), and
// free-text fields (names, city, state) lowercased with punctuation stripped.
function hashEmail(email) {
  const v = String(email || '').trim().toLowerCase();
  return v ? sha256(v) : undefined;
}

function hashPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.startsWith('961')) return sha256(digits);
  digits = digits.replace(/^0+/, '');
  if (!digits) return undefined;
  if (digits.length <= 8) digits = `961${digits}`;
  return sha256(digits);
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function hashText(value) {
  const v = normalizeText(value);
  return v ? sha256(v) : undefined;
}

// fbc must be fb.1.{creationTime_ms}.{fbclid}; drop malformed values.
function validFbc(fbc) {
  return /^fb\.1\.\d{13,}\..+/.test(String(fbc || '')) ? String(fbc) : undefined;
}

// Assemble a Meta user_data object from hashed identity fields + raw signals.
// Hashed fields are single-element arrays (Meta's multi-match format);
// ip/ua/fbp/fbc pass through UNHASHED exactly as Meta expects.
function assembleUserData({ em, ph, fn, ln, ct, st, zp, country, externalId, signals = {} } = {}) {
  const data = {};
  if (em) data.em = [em];
  if (ph) data.ph = [ph];
  if (fn) data.fn = [fn];
  if (ln) data.ln = [ln];
  if (ct) data.ct = [ct];
  if (st) data.st = [st];
  if (zp) data.zp = [zp];
  if (country) data.country = [country];
  if (externalId) data.external_id = [externalId];
  if (signals.clientIp) data.client_ip_address = signals.clientIp;
  if (signals.userAgent) data.client_user_agent = signals.userAgent;
  if (signals.fbp) data.fbp = signals.fbp;
  const fbc = validFbc(signals.fbc);
  if (fbc) data.fbc = fbc;
  return data;
}

// Merge CLIENT-PRE-HASHED identity fields into a server-built user_data object
// (used by /api/meta/track). The browser only ever sends SHA-256 hashes it
// persisted from a previous checkout — raw PII is never accepted. Only
// well-formed 64-char lowercase-hex values under an allowlist are merged.
const CLIENT_HASHED_KEYS = ['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'external_id'];
export function mergeClientHashedUserData(signals, clientHashed) {
  const out = assembleUserData({ signals });
  if (!clientHashed || typeof clientHashed !== 'object') return out;
  for (const k of CLIENT_HASHED_KEYS) {
    const v = clientHashed[k];
    if (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) && !out[k]) out[k] = [v];
  }
  return out;
}

// Build the CAPI Purchase payload from an order + its items. Exported for tests.
export function buildPurchasePayload(order, items, opts = {}) {
  const defaultNow = Math.floor(Date.now() / 1000);
  const rawEventTime = opts.eventTime ?? opts.now ?? defaultNow;
  const eventTime = Number.isFinite(Number(rawEventTime))
    ? Math.floor(Number(rawEventTime))
    : defaultNow;
  const {
    eventId = order.id,
    eventSourceUrl = `${publicBaseUrl()}/checkout`,
    signals = {},
    externalIdHash,
  } = opts;

  const contents = (items || []).map((it) => ({
    id: normalizeSku(it.sku || it.product_id),
    quantity: Number(it.quantity || 1),
    item_price: Number(it.unit_price_usd || 0),
  }));

  // Full EMQ user_data (Meta best practices): hashed email/phone with country
  // code, first/last name, city, state (district), country — plus unhashed
  // ip/ua/fbp/fbc request signals and a consistent external_id.
  const nameParts = String(order.customer_name || '').trim().split(/\s+/);
  const ext = (typeof externalIdHash === 'string' && /^[0-9a-f]{64}$/.test(externalIdHash))
    ? externalIdHash
    : (order.customer_id || order.customer_email)
      ? sha256(String(order.customer_id || order.customer_email).trim().toLowerCase())
      : undefined;
  const userData = assembleUserData({
    em: hashEmail(order.customer_email),
    ph: hashPhone(order.customer_phone),
    fn: hashText(nameParts[0]),
    ln: hashText(nameParts.slice(1).join(' ')),
    ct: hashText(order.city),
    st: hashText(order.district || order.state),
    zp: hashText(order.postal_code || order.zip),
    country: hashText(order.phone_country || 'lb'),
    externalId: ext,
    signals,
  });

  const event = {
    event_name: 'Purchase',
    event_time: eventTime,
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
  const event = payload?.data?.[0];
  const userData = event?.user_data;
  const eventId = event?.event_id;
  // DEBUG: set META_DEBUG=true to verify outgoing event_time values in Test Events.
  if (process.env.META_DEBUG === 'true' && event) {
    console.log('[metaCapi:DEBUG]', {
      event_name: event.event_name,
      event_time: event.event_time,
      event_time_utc: new Date(event.event_time * 1000).toISOString(),
      fbc_attached: !!userData?.fbc,
      event_id: eventId ?? null,
    });
  }
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

// ─── Client-originated CAPI events (PageView / ViewContent / AddToCart / IC) ──
// The browser Pixel fires these with a dedup event_id; the storefront hands the
// same id + NON-PII custom_data to POST /api/meta/track so the server sends the
// deduplicated CAPI twin. Purchase is deliberately NOT in this allowlist: it
// fires only from the trusted server order flow (metaTrackPurchase).

export const TRACK_EVENTS = new Set(['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout']);

export function isTrackEvent(name) {
  return TRACK_EVENTS.has(name);
}

// Sanitize client-sent contents → [{ id, quantity, item_price? }] with ids
// normalized exactly like the catalog feed. Drops id-less lines.
export function sanitizeContents(contents) {
  const out = [];
  for (const c of Array.isArray(contents) ? contents : []) {
    const id = normalizeSku(c?.id);
    if (!id) continue;
    const quantity = Number(c?.quantity) || 1;
    const price = Number(c?.item_price);
    out.push({ id, quantity, ...(Number.isFinite(price) ? { item_price: price } : {}) });
  }
  return out;
}

// Build CAPI custom_data from the client-sent NON-PII fields.
export function buildTrackCustomData(input = {}) {
  const contents = sanitizeContents(input.contents);
  let contentIds = contents.map((c) => c.id);
  if (!contentIds.length && Array.isArray(input.content_ids)) {
    contentIds = input.content_ids.map((v) => normalizeSku(v)).filter(Boolean);
  }
  const custom = {};
  if (contentIds.length) {
    custom.content_type = 'product';
    custom.content_ids = contentIds;
  }
  if (contents.length) custom.contents = contents;
  const value = Number(input.value);
  if (Number.isFinite(value)) {
    custom.value = value;
    const cur = String(input.currency || 'USD').trim().toUpperCase();
    custom.currency = cur || 'USD';
  }
  const numItems = Number(input.num_items);
  if (Number.isFinite(numItems) && numItems > 0) custom.num_items = numItems;
  return custom;
}

// Send a non-Purchase event to the Conversions API. Silent no-op when
// unconfigured; never rejects — tracking must never break the caller.
export async function sendTrackCapi({
  eventName, eventId, eventTime, eventSourceUrl, userData = {}, customData = {},
}) {
  if (!isCapiConfigured()) return { sent: false, skipped: 'not_configured' };
  const pixelId = process.env.AURA_META_PIXEL_ID;
  const token = process.env.AURA_META_CAPI_ACCESS_TOKEN;

  const event = {
    event_name: eventName,
    event_time: eventTime || Math.floor(Date.now() / 1000),
    action_source: 'website',
    user_data: userData,
    custom_data: customData,
  };
  if (eventId) event.event_id = eventId;
  if (eventSourceUrl) event.event_source_url = eventSourceUrl;

  const payload = { data: [event] };
  if (process.env.AURA_META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.AURA_META_TEST_EVENT_CODE;
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[metaCapi] track send failed', { event: eventName, status: res.status, error: text.slice(0, 300) });
      return { sent: false, status: res.status, error: text.slice(0, 500) };
    }
    return { sent: true, status: res.status };
  } catch (e) {
    console.error('[metaCapi] track send error', { event: eventName, message: e?.message });
    return { sent: false, error: e?.message || 'capi request failed' };
  }
}
