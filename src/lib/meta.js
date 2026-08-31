// Meta (Facebook) Pixel integration for AURA.
//
// Fully env-driven. If VITE_META_PIXEL_ID is unset the whole module is a
// silent no-op, so the storefront works with zero config.
//
// IMPLIED CONSENT MODEL: tracking fires by default for every shopper as soon
// as the pixel is configured; only an EXPLICIT "Decline" click on the consent
// banner stops it (see hasConsent() below). Lebanon/MENA e-commerce isn't
// under GDPR's strict prior-opt-in mandate, and the previous default-revoke
// model silently dropped any shopper who bounced, ignored, or never clicked
// the banner from every pixel (Meta, TikTok, and even GA4, which all read
// this same hasConsent() flag) — undercounting real traffic in Ads Manager
// and shrinking Website Custom Audiences well below the site's actual visitor
// count. The choice is remembered in localStorage.

import { safeStorage } from '@/lib/safeStorage';

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || '';
const CONSENT_KEY = 'aura-meta-consent'; // 'granted' | 'denied'
let lastTrackedPage = null;

export function isPixelConfigured() {
  return !!PIXEL_ID;
}

// Normalize a SKU exactly the way the catalog feed and the CAPI backend do, so
// pixel content_ids match the feed ids (Meta catalog matching is case-sensitive).
export function normalizeSku(sku) {
  return String(sku ?? '').trim().toUpperCase();
}

export function getConsent() {
  return safeStorage.getItem(CONSENT_KEY);
}

function storeConsent(value) {
  safeStorage.setItem(CONSENT_KEY, value);
}

// True unless the shopper has EXPLICITLY declined. No stored choice yet (new
// visitor) counts as implied consent, matching the default-on model above.
export function hasConsent() {
  return getConsent() !== 'denied';
}

// Whether we still need to ask (pixel configured and no decision recorded yet).
export function shouldAskConsent() {
  return isPixelConfigured() && getConsent() == null;
}

// Inject the Meta Pixel base code once. Runs as soon as hasConsent() is true
// (implied consent by default) and is only skipped once the shopper has
// explicitly declined.
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

  // Consent is GRANTED before init, never revoked-first: injectPixel only runs
  // when hasConsent() is true (default for new visitors, or explicit Accept),
  // and the current fbevents.js drops a pixel init that arrives while consent
  // is revoked — with revoke-first the pixel never initializes at all and
  // every event is silently swallowed (verified live: getState().pixels
  // stayed []). denyConsent() still revokes on the live pixel when the
  // shopper explicitly declines.
  window.fbq('consent', 'grant');
  window.fbq('init', PIXEL_ID);
}

// Call once on app boot. Under implied consent this fires for every shopper
// who hasn't explicitly declined — including brand-new visitors — injecting
// the pixel and sending the initial PageView immediately, before the banner
// is even shown.
export function initMetaPixel() {
  if (!PIXEL_ID || !hasConsent()) return;
  injectPixel();
  window.fbq('consent', 'grant');
  trackPageView(true);
}

export function grantConsent() {
  storeConsent('granted');
  if (!PIXEL_ID) return;
  // Under implied consent, initMetaPixel() already injected the pixel and
  // fired the first PageView on mount (hasConsent() was already true before
  // this banner was even clicked). injectPixel()'s own `injected` guard makes
  // this call safe/idempotent — do NOT re-fire trackPageView here, or every
  // shopper who explicitly clicks Accept gets double-counted.
  injectPixel();
  window.fbq('consent', 'grant');
}

export function denyConsent() {
  storeConsent('denied');
  lastTrackedPage = null;
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

function currentPageKey() {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}`;
}

export function trackPageView(force = false) {
  if (!ready()) return;
  const pageKey = currentPageKey();
  if (!force && pageKey && pageKey === lastTrackedPage) return;
  lastTrackedPage = pageKey;
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
