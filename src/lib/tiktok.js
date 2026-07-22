// TikTok Pixel + Events API integration for AURA — the TikTok twin of
// lib/meta.js, installed ALONGSIDE the Meta Pixel (never replacing it).
//
// Fully env-driven and consent-gated. If VITE_TIKTOK_PIXEL_ID is unset the
// whole module is a silent no-op (the ttq script is never even injected), so
// the storefront works with zero config. Consent is SHARED with the Meta Pixel
// (the same banner + localStorage key in lib/meta.js): TikTok has no fbq-style
// consent('revoke') API, so the gate here is that no ttq call happens until
// hasConsent() is true.
//
// Event naming follows TikTok's standard events; content_id is the normalized
// product SKU everywhere so browser events match the TikTok catalog feed
// (sku_id) and the server-side Events API events.

import { hasConsent, newEventId, normalizeSku } from '@/lib/meta';

const PIXEL_ID = import.meta.env.VITE_TIKTOK_PIXEL_ID || '';
const CURRENCY = 'USD';

export function isTikTokConfigured() {
  return !!PIXEL_ID;
}

// Inject the TikTok Pixel (ttq) base code once. Unlike the Meta Pixel there is
// no revoke-by-default API, so the script is only ever injected when the pixel
// is configured; every event call is additionally gated on marketing consent.
let injected = false;
function injectPixel() {
  if (injected || typeof window === 'undefined' || !PIXEL_ID) return;
  injected = true;
  /* eslint-disable */
  !(function (w, d, t) {
    w.TiktokAnalyticsObject = t;
    var ttq = w[t] = w[t] || [];
    ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
    ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e; };
    ttq.load = function (e, n) {
      var r = 'https://analytics.tiktok.com/i18n/pixel/events.js', o = n && n.partner;
      ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = r;
      ttq._t = ttq._t || {}; ttq._t[e] = +new Date;
      ttq._o = ttq._o || {}; ttq._o[e] = n || {};
      n = d.createElement('script'); n.type = 'text/javascript'; n.async = !0;
      n.src = r + '?sdkid=' + e + '&lib=' + t;
      var s = d.getElementsByTagName('script')[0]; s.parentNode.insertBefore(n, s);
    };
    ttq.load(PIXEL_ID);
  })(window, document, 'ttq');
  /* eslint-enable */
}

// Call once on app boot. Injects the pixel and, when the shopper already
// granted consent on a previous visit, fires the initial page view.
export function initTikTokPixel() {
  if (!PIXEL_ID) return;
  injectPixel();
  if (hasConsent()) ttTrackPageView();
}

// Call from the consent banner's accept handler (after grantConsent()): counts
// the page the visitor accepted on, since views were withheld until now.
export function onConsentGranted() {
  if (!PIXEL_ID) return;
  injectPixel();
  ttTrackPageView();
}

// Guard: only emit when configured AND consented AND ttq is present.
function ready() {
  return !!PIXEL_ID && typeof window !== 'undefined' && !!window.ttq && hasConsent();
}

export function ttTrackPageView() {
  if (!ready() || typeof window.ttq.page !== 'function') return;
  window.ttq.page();
}

function ttTrack(event, props, eventId) {
  if (!ready()) return;
  const opts = eventId ? { event_id: eventId } : undefined;
  if (props && opts) window.ttq.track(event, props, opts);
  else if (props) window.ttq.track(event, props);
  else window.ttq.track(event);
}

// PDP view. content_id:[sku], value, currency, contents.
export function ttViewContent(product, price) {
  if (!ready() || !product) return;
  const id = normalizeSku(product.sku || product.slug || product.id);
  const value = Number(price ?? product.price_usd ?? 0);
  ttTrack('ViewContent', {
    content_type: 'product',
    content_ids: [id],
    contents: [{ content_id: id, content_type: 'product', quantity: 1, price: value }],
    value,
    currency: CURRENCY,
  });
}

// Add-to-cart. value is the line value (unit price × quantity).
export function ttAddToCart(product, quantity, price) {
  if (!ready() || !product) return;
  const id = normalizeSku(product.sku || product.slug || product.id);
  const qty = Number(quantity || 1);
  const unit = Number(price ?? product.price_usd ?? 0);
  ttTrack('AddToCart', {
    content_type: 'product',
    content_ids: [id],
    contents: [{ content_id: id, content_type: 'product', quantity: qty, price: unit }],
    value: Number((unit * qty).toFixed(2)),
    currency: CURRENCY,
  });
}

// Checkout start. items: cart items [{ product, quantity, price }].
export function ttInitiateCheckout(items, value) {
  if (!ready() || !Array.isArray(items) || items.length === 0) return;
  const contents = items.map((i) => {
    const id = normalizeSku(i.product?.sku || i.product?.slug || i.product?.id);
    return {
      content_id: id,
      content_type: 'product',
      quantity: Number(i.quantity || 1),
      price: Number(i.price ?? i.product?.price_usd ?? 0),
    };
  });
  ttTrack('InitiateCheckout', {
    content_type: 'product',
    content_ids: contents.map((c) => c.content_id),
    contents,
    value: Number(value ?? 0),
    currency: CURRENCY,
  });
}

export { newEventId };
