// Meta (Facebook) Pixel integration for AURA.
//
// Fully env-driven and consent-gated. If VITE_META_PIXEL_ID is unset the whole
// module is a silent no-op, so the storefront works with zero config. The pixel
// is loaded with consent REVOKED by default (GDPR-style) and only starts firing
// after the shopper accepts tracking via the consent banner. The choice is
// remembered in localStorage.

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || '';
const CONSENT_KEY = 'aura-meta-consent'; // 'granted' | 'denied'

export function isPixelConfigured() {
  return !!PIXEL_ID;
}

// Normalize a SKU exactly the way the catalog feed and the CAPI backend do, so
// pixel content_ids match the feed ids (Meta catalog matching is case-sensitive).
export function normalizeSku(sku) {
  return String(sku ?? '').trim().toUpperCase();
}

export function getConsent() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}

function storeConsent(value) {
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* ignore */ }
}

export function hasConsent() {
  return getConsent() === 'granted';
}

// Whether we still need to ask (pixel configured and no decision recorded yet).
export function shouldAskConsent() {
  return isPixelConfigured() && getConsent() == null;
}

// Inject the Meta Pixel base code once. Loads with consent revoked; no events
// are sent to Meta until grantConsent() flips it.
let injected = false;
function injectPixel() {
  if (injected || typeof window === 'undefined' || !PIXEL_ID) return;
  injected = true;
  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  // Revoke first so nothing is sent before the shopper opts in.
  window.fbq('consent', 'revoke');
  window.fbq('init', PIXEL_ID);
}

// Call once on app boot. Injects the pixel (still revoked) and, if the shopper
// already granted consent in a previous visit, re-grants + fires the initial
// PageView.
export function initMetaPixel() {
  if (!PIXEL_ID) return;
  injectPixel();
  if (hasConsent()) {
    window.fbq('consent', 'grant');
    trackPageView();
  }
}

export function grantConsent() {
  storeConsent('granted');
  if (!PIXEL_ID) return;
  injectPixel();
  window.fbq('consent', 'grant');
  trackPageView();
}

export function denyConsent() {
  storeConsent('denied');
  if (PIXEL_ID && window.fbq) window.fbq('consent', 'revoke');
}

// Guard: only emit when configured AND consented.
function ready() {
  return !!PIXEL_ID && typeof window !== 'undefined' && !!window.fbq && hasConsent();
}

// Random event_id shared between a browser event and its server (CAPI)
// counterpart so Meta can deduplicate the two.
export function newEventId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function trackPageView() {
  if (!ready()) return;
  window.fbq('track', 'PageView');
}

// Generic passthrough for any standard event.
export function trackEvent(name, data = {}, options = {}) {
  if (!ready()) return;
  window.fbq('track', name, data, options);
}

const CURRENCY = 'USD';

export function trackViewContent(product, price) {
  if (!ready() || !product) return;
  const id = normalizeSku(product.sku || product.slug || product.id);
  window.fbq('track', 'ViewContent', {
    content_ids: [id],
    content_type: 'product',
    content_name: product.name,
    value: Number(price ?? product.price_usd ?? 0),
    currency: CURRENCY,
  });
}

export function trackAddToCart(product, quantity, price) {
  if (!ready() || !product) return;
  const id = normalizeSku(product.sku || product.slug || product.id);
  const qty = Number(quantity || 1);
  const unit = Number(price ?? product.price_usd ?? 0);
  window.fbq('track', 'AddToCart', {
    content_ids: [id],
    content_type: 'product',
    content_name: product.name,
    contents: [{ id, quantity: qty, item_price: unit }],
    value: Number((unit * qty).toFixed(2)),
    currency: CURRENCY,
  });
}

// items: cart items [{ product, quantity, price }]
export function trackInitiateCheckout(items, value) {
  if (!ready() || !Array.isArray(items) || items.length === 0) return;
  const contents = items.map((i) => ({
    id: normalizeSku(i.product?.sku || i.product?.slug || i.product?.id),
    quantity: Number(i.quantity || 1),
    item_price: Number(i.price ?? i.product?.price_usd ?? 0),
  }));
  window.fbq('track', 'InitiateCheckout', {
    content_ids: contents.map((c) => c.id),
    content_type: 'product',
    contents,
    num_items: contents.reduce((s, c) => s + c.quantity, 0),
    value: Number(value ?? 0),
    currency: CURRENCY,
  });
}

// Fire the browser Purchase event with a shared eventID for CAPI dedup.
export function trackPurchase({ items, value, eventId }) {
  if (!ready() || !Array.isArray(items)) return;
  const contents = items.map((i) => ({
    id: normalizeSku(i.product?.sku || i.product?.slug || i.product?.id),
    quantity: Number(i.quantity || 1),
    item_price: Number(i.price ?? i.product?.price_usd ?? 0),
  }));
  window.fbq('track', 'Purchase', {
    content_ids: contents.map((c) => c.id),
    content_type: 'product',
    contents,
    num_items: contents.reduce((s, c) => s + c.quantity, 0),
    value: Number(value ?? 0),
    currency: CURRENCY,
  }, eventId ? { eventID: eventId } : undefined);
}
