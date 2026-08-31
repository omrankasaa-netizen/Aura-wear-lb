import { hasConsent, normalizeSku } from '@/lib/meta';

const MEASUREMENT_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID || '';
const CURRENCY = 'USD';
let injected = false;
let configured = false;
let lastTrackedPage = null;

export function isGa4Configured() {
  return !!MEASUREMENT_ID;
}

function injectGtag() {
  if (injected || typeof window === 'undefined' || !MEASUREMENT_ID) return;
  injected = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);
}

function configureGtag() {
  if (configured || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  configured = true;
  window.gtag('js', new Date());
  // Explicit page_view tracking gives reliable SPA dedup and parity with other pixels.
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false });
}

function ready() {
  return !!MEASUREMENT_ID && typeof window !== 'undefined' && typeof window.gtag === 'function' && hasConsent();
}

function currentPageKey() {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}`;
}

function emitEvent(name, params = {}) {
  if (!ready()) return;
  window.gtag('event', name, params);
}

function mapGa4Item(itemLike, defaults = {}) {
  const rawProduct = itemLike?.product || itemLike || {};
  const itemId = normalizeSku(rawProduct.sku || rawProduct.slug || rawProduct.id || defaults.item_id);
  return {
    item_id: itemId,
    item_name: rawProduct.name || defaults.item_name || itemId,
    item_variant: [itemLike?.variant?.size, itemLike?.variant?.color].filter(Boolean).join(' / ') || undefined,
    price: Number(defaults.price ?? itemLike?.price ?? rawProduct.price_usd ?? 0),
    quantity: Number(defaults.quantity ?? itemLike?.quantity ?? 1),
  };
}

// Under implied consent this fires for every shopper who hasn't explicitly
// declined — including brand-new visitors — injecting gtag and sending the
// initial page_view immediately.
export function initGa4() {
  if (!MEASUREMENT_ID || !hasConsent()) return;
  injectGtag();
  configureGtag();
  gaTrackPageView(true);
}

// Call from the consent banner's explicit Accept handler. injectGtag()/
// configureGtag() are idempotent (own `injected`/`configured` guards) —
// initGa4() already ran on mount under implied consent, so this does NOT
// re-fire gaTrackPageView (avoids double-counting the visit).
export function onGa4ConsentGranted() {
  if (!MEASUREMENT_ID) return;
  injectGtag();
  configureGtag();
}

export function gaTrackPageView(force = false) {
  if (!ready()) return;
  const pageKey = currentPageKey();
  if (!force && pageKey && pageKey === lastTrackedPage) return;
  lastTrackedPage = pageKey;
  emitEvent('page_view', {
    page_location: typeof window !== 'undefined' ? window.location.href : undefined,
    page_path: typeof window !== 'undefined' ? window.location.pathname : undefined,
    page_title: typeof document !== 'undefined' ? document.title : undefined,
  });
}

export function gaViewItem(product, price) {
  if (!product) return;
  const item = mapGa4Item(product, { price, quantity: 1 });
  emitEvent('view_item', {
    currency: CURRENCY,
    value: Number(price ?? product.price_usd ?? 0),
    items: [item],
  });
}

export function gaAddToCart(product, quantity, price) {
  if (!product) return;
  const qty = Number(quantity || 1);
  const unit = Number(price ?? product.price_usd ?? 0);
  const item = mapGa4Item(product, { price: unit, quantity: qty });
  emitEvent('add_to_cart', {
    currency: CURRENCY,
    value: Number((unit * qty).toFixed(2)),
    items: [item],
  });
}

export function gaBeginCheckout(items = [], value = 0) {
  if (!Array.isArray(items) || items.length === 0) return;
  emitEvent('begin_checkout', {
    currency: CURRENCY,
    value: Number(value ?? 0),
    items: items.map((item) => mapGa4Item(item)),
  });
}

export function gaPurchase({ orderId, transactionId, items = [], value = 0, currency = CURRENCY } = {}) {
  const txId = String(transactionId || orderId || '').trim();
  if (!txId || !Array.isArray(items) || items.length === 0) return;
  emitEvent('purchase', {
    transaction_id: txId,
    order_id: String(orderId || txId),
    currency: String(currency || CURRENCY),
    value: Number(value ?? 0),
    items: items.map((item) => mapGa4Item(item)),
  });
}
