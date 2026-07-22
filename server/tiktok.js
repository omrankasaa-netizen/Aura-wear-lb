// Server-side TikTok integration for AURA: Catalog feed builder + Events API
// (server-side CompletePayment) sender. The TikTok twin of server/meta.js.
// Everything is env-driven and degrades to a safe no-op when the relevant env
// vars are unset, so the site runs with zero TikTok config.
//
//   AURA_TIKTOK_PIXEL_ID         pixel id (Events API event_source_id)
//   AURA_TIKTOK_ACCESS_TOKEN     Events API access token — SECRET, backend only
//   AURA_TIKTOK_TEST_EVENT_CODE  optional; routes events to the Test Events tab
//   AURA_PUBLIC_BASE_URL         public site origin used for feed links
//
// The catalog feed needs no secrets and no env vars — it always works.

import crypto from 'node:crypto';
import { normalizeSku, publicBaseUrl } from './meta.js';

const CURRENCY = 'USD';
const TIKTOK_API_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

export function isTikTokConfigured() {
  return !!(process.env.AURA_TIKTOK_PIXEL_ID && process.env.AURA_TIKTOK_ACCESS_TOKEN);
}

// ─── Hashing (same normalization rules as the Meta CAPI sender) ─────────────

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// PII is hashed after normalization: email trimmed + lowercased, phone digits
// only. ip/user_agent/ttp/ttclid are passed through raw as TikTok expects.
function hashEmail(email) {
  const v = String(email || '').trim().toLowerCase();
  return v ? sha256(v) : undefined;
}

function hashPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? sha256(digits) : undefined;
}

// Build TikTok `user` — only keys that have values are included.
export function buildUserData({ email, phone, clientIp, userAgent, ttp, ttclid } = {}) {
  const user = {};
  const em = hashEmail(email);
  const ph = hashPhone(phone);
  if (em) user.email = em;
  if (ph) user.phone = ph;
  if (clientIp) user.ip = clientIp;
  if (userAgent) user.user_agent = userAgent;
  if (ttp) user.ttp = ttp;
  if (ttclid) user.ttclid = ttclid;
  return user;
}

// ─── Events API ─────────────────────────────────────────────────────────────

// Normalize order lines to TikTok `contents`. Uses the normalized sku as
// content_id so events match the catalog feed (sku_id) and the browser Pixel.
// Lines without a sku are skipped (never emit undefined ids).
export function buildContents(items = []) {
  const contents = [];
  for (const it of items) {
    const id = normalizeSku(it?.sku);
    if (!id) continue;
    const price = Number(it.unit_price_usd ?? it.price ?? it.item_price);
    contents.push({
      content_id: id,
      content_type: 'product',
      quantity: Number(it.quantity) || 1,
      ...(Number.isFinite(price) ? { price } : {}),
    });
  }
  return contents;
}

// Build the CompletePayment event from TRUSTED order data (DB reads only).
// Exported for tests.
export function buildCompletePaymentEvent(order, items, opts = {}) {
  const {
    eventId = order.id,
    pageUrl = `${publicBaseUrl()}/checkout`,
    now = Math.floor(Date.now() / 1000),
    userData = {},
  } = opts;

  const contents = buildContents(items);
  const event = {
    event: 'CompletePayment',
    event_time: now,
    event_id: eventId,
    user: userData,
    page: { url: pageUrl },
    properties: {
      content_type: 'product',
      contents,
      currency: CURRENCY,
      value: Number(order.grand_total_usd || 0),
    },
  };
  return event;
}

// POST a single event to the TikTok Events API 2.0. Resolves to a structured
// result and never rejects — tracking can never break the order flow. Skips
// (no network) when the access token is unset. NEVER logs the token or PII.
export async function sendTikTokEvent(event) {
  const pixelId = process.env.AURA_TIKTOK_PIXEL_ID;
  const token = process.env.AURA_TIKTOK_ACCESS_TOKEN;
  const testCode = process.env.AURA_TIKTOK_TEST_EVENT_CODE;

  if (!pixelId || !token) {
    return { sent: false, skipped: 'not_configured' };
  }

  const body = {
    event_source: 'web',
    event_source_id: pixelId,
    data: [event],
  };
  if (testCode) body.test_event_code = testCode;

  try {
    const resp = await fetch(TIKTOK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': token,
      },
      body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => ({}));
    // TikTok returns HTTP 200 with a non-zero `code` on logical errors, so
    // check both the transport status and the API code.
    if (!resp.ok || (json && json.code !== 0 && json.code !== undefined)) {
      console.error('[tiktokEvents] send failed', {
        event: event?.event, status: resp.status, code: json?.code, message: json?.message,
      });
      return { sent: false, status: resp.status, code: json?.code, error: json?.message };
    }
    return { sent: true, response: json };
  } catch (e) {
    console.error('[tiktokEvents] send error', { event: event?.event, message: e?.message });
    return { sent: false, error: e?.message };
  }
}

// Send a CompletePayment event for an order. Silent no-op when unconfigured.
// Returns { sent: boolean, skipped?, ... }.
export async function sendCompletePayment(order, items, opts = {}) {
  if (!isTikTokConfigured()) return { sent: false, skipped: 'not_configured' };
  const userData = buildUserData({
    email: order.customer_email,
    phone: order.customer_phone,
    clientIp: opts.clientIp,
    userAgent: opts.userAgent,
    ttp: opts.ttp,
    ttclid: opts.ttclid,
  });
  const event = buildCompletePaymentEvent(order, items, { ...opts, userData });
  return sendTikTokEvent(event);
}

// ─── TikTok Catalog feed (CSV) ──────────────────────────────────────────────
// Mirrors the Meta feed (same sku id, price format "<amount> USD", availability
// strings) but uses TikTok's column names and populates
// google_product_category/product_type from the DB category.

export const TIKTOK_FEED_COLUMNS = [
  'sku_id', 'title', 'description', 'availability', 'condition', 'price',
  'sale_price', 'link', 'image_link', 'brand', 'google_product_category',
  'product_type', 'item_group_id',
];

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatFeedPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)} ${CURRENCY}` : '';
}

// Conservative default when no category rule matches — AURA sells men's apparel.
const DEFAULT_GOOGLE_CATEGORY = 'Apparel & Accessories > Clothing';

// Keyword → Google Product Taxonomy mapping, checked in order (first match
// wins). Matched against lowercased "category / subcategory / product name".
const GOOGLE_CATEGORY_RULES = [
  [/sock\b|socks/, 'Apparel & Accessories > Clothing > Underwear & Socks > Socks'],
  [/boxer|brief|underwear/, 'Apparel & Accessories > Clothing > Underwear & Socks'],
  [/jeans|denim/, 'Apparel & Accessories > Clothing > Pants > Jeans'],
  [/jogger|sweatpant|track ?pant/, 'Apparel & Accessories > Clothing > Pants > Sweatpants'],
  [/cargo|trouser|chino|\bpants?\b/, 'Apparel & Accessories > Clothing > Pants'],
  [/short/, 'Apparel & Accessories > Clothing > Shorts'],
  [/polo/, 'Apparel & Accessories > Clothing > Shirts & Tops > Polos'],
  [/t-?shirt|tee\b|tank/, 'Apparel & Accessories > Clothing > Shirts & Tops > T-Shirts'],
  [/shirt/, 'Apparel & Accessories > Clothing > Shirts & Tops'],
  [/hoodie|sweatshirt/, 'Apparel & Accessories > Clothing > Shirts & Tops > Sweatshirts'],
  [/jacket|coat|overshirt/, 'Apparel & Accessories > Outerwear > Coats & Jackets'],
  [/\bset\b|outfit|matching/, 'Apparel & Accessories > Clothing > Outfit Sets'],
  [/hat\b|\bcap\b|beanie/, 'Apparel & Accessories > Clothing Accessories > Hats'],
  [/belt/, 'Apparel & Accessories > Clothing Accessories > Belts'],
];

export function mapGoogleCategory({ category = '', subcategory = '', name = '' } = {}) {
  const haystack = `${subcategory} ${category} ${name}`.toLowerCase();
  for (const [pattern, taxonomy] of GOOGLE_CATEGORY_RULES) {
    if (pattern.test(haystack)) return taxonomy;
  }
  return DEFAULT_GOOGLE_CATEGORY;
}

// Build a single TikTok feed row (unescaped values). ctx mirrors the Meta feed
// route: { base, imageUrl, inStock, category, subcategory }.
export function buildTiktokFeedRow(product, ctx = {}) {
  const { base = publicBaseUrl(), imageUrl = '', inStock = true, category = '', subcategory = '' } = ctx;
  const sku = normalizeSku(product.sku || product.slug || product.id);
  const price = Number(product.price_usd || 0);
  const compareAt = Number(product.compare_at_price_usd || 0);
  const onSale = compareAt > price && price > 0;
  const name = product.name || product.slug || sku;

  return {
    sku_id: sku,
    title: name,
    description: (product.description || product.short_description || name).trim(),
    availability: inStock ? 'in stock' : 'out of stock',
    condition: 'new',
    price: onSale ? formatFeedPrice(compareAt) : formatFeedPrice(price),
    sale_price: onSale ? formatFeedPrice(price) : '',
    link: `${base}/product/${product.slug || sku}`,
    image_link: imageUrl || `${base}/brand/aura-icon-512.png`,
    brand: 'AURA',
    google_product_category: mapGoogleCategory({ category, subcategory, name }),
    product_type: [category, subcategory].filter(Boolean).join(' > '),
    item_group_id: sku,
  };
}

export function buildTiktokFeedCsv(rows = []) {
  const header = TIKTOK_FEED_COLUMNS.join(',');
  const lines = rows.map((r) => TIKTOK_FEED_COLUMNS.map((c) => csvEscape(r[c])).join(','));
  return `${[header, ...lines].join('\r\n')}\r\n`;
}
