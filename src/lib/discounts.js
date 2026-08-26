/**
 * Shared discount resolution logic used by storefront and checkout.
 * discounts: array of Discount records from DB
 * product: a Product record
 * size (optional): the selected variant size. Discounts can be scoped to
 * specific sizes (e.g. "$5 off XXL only" or "flat $15 on XL") via the
 * comma-separated `sizes` field — a size-scoped discount applies ONLY where a
 * real size is known (product page selection, cart, checkout, manual orders).
 * Where no size is chosen yet (product cards, grids), size-scoped discounts
 * deliberately do NOT discount the displayed price: a flat "$15 on XL" must
 * not make the whole product look like it costs $15. Use
 * getBestDiscountAnySize() for advertising-only contexts (e.g. a Sale filter)
 * that need to know a size-scoped sale exists without quoting a price.
 * cartItems (optional): for promo code scope checks
 */

export function isDiscountLive(d) {
  if (!d.is_active) return false;
  const now = Date.now();
  if (d.starts_at && new Date(d.starts_at).getTime() > now) return false;
  if (d.ends_at && new Date(d.ends_at).getTime() < now) return false;
  return true;
}

export function isCampaignLive(c) {
  if (!c.is_active) return false;
  const now = Date.now();
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return false;
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return false;
  return true;
}

/** Normalized list of sizes a discount is scoped to (empty = all sizes). */
export function getDiscountSizes(d) {
  return (d?.sizes || '').split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * True when the discount covers the given size.
 * A null/empty size means "no size chosen" (product cards, grids, PDP before
 * selection) — size-scoped discounts do NOT match there, so a sale on XL can
 * never rewrite the price of every size on a product card. Cart, checkout and
 * manual orders always pass the real size, which is where the discount bites.
 */
export function discountMatchesSize(d, size) {
  const sizes = getDiscountSizes(d);
  if (!sizes.length) return true;
  if (size == null || size === '') return false;
  const norm = String(size).trim().toLowerCase();
  return sizes.some(s => s.toLowerCase() === norm);
}

/** Returns the best matching auto-discount for a product (or null). */
export function getBestDiscount(discounts, product, size = null) {
  const live = discounts.filter(isDiscountLive);
  const matching = live.filter(d => discountMatchesProduct(d, product) && discountMatchesSize(d, size));
  if (!matching.length) return null;
  // Pick largest saving
  return matching.reduce((best, d) => {
    const saving = calcSaving(d, product.price_usd);
    const bestSaving = best ? calcSaving(best, product.price_usd) : -1;
    return saving > bestSaving ? d : best;
  }, null);
}

/**
 * Advertising-only lookup: the best live discount for a product IGNORING size
 * scoping. Use where you need to know a sale exists (e.g. the shop's Sale
 * filter or a "sale on select sizes" hint) but must not quote a price, since
 * the discounted price may only be valid for specific sizes.
 */
export function getBestDiscountAnySize(discounts, product) {
  const live = discounts.filter(isDiscountLive);
  const matching = live.filter(d => discountMatchesProduct(d, product));
  if (!matching.length) return null;
  return matching.reduce((best, d) => {
    const saving = calcSaving(d, product.price_usd);
    const bestSaving = best ? calcSaving(best, product.price_usd) : -1;
    return saving > bestSaving ? d : best;
  }, null);
}

function discountMatchesProduct(d, product) {
  switch (d.applies_to) {
    case 'all_products': return true;
    case 'category': return d.target === product.category_id || product.category_id?.toLowerCase() === d.target?.toLowerCase();
    case 'collection': return d.target === product.collection_id;
    case 'tag': {
      const tags = (product.tags || '').split(',').map(t => t.trim().toLowerCase());
      return tags.includes((d.target || '').toLowerCase());
    }
    case 'specific_products': {
      const targets = (d.target || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const id = String(product.id || '').trim().toLowerCase();
      const sku = String(product.sku || '').trim().toLowerCase();
      return (!!id && targets.includes(id)) || (!!sku && targets.includes(sku));
    }
    default: return false;
  }
}

function calcSaving(discount, price) {
  if (discount.type === 'percentage') return (price * discount.value) / 100;
  if (discount.type === 'fixed_amount') return discount.value;
  // fixed_price: saving is whatever brings the price down to the flat value
  // (0 when the flat value isn't actually cheaper).
  if (discount.type === 'fixed_price') return Math.max(price - discount.value, 0);
  return 0;
}

export function applyDiscountToPrice(discount, price) {
  if (!discount) return price;
  if (discount.type === 'percentage') {
    const discounted = price - (price * discount.value) / 100;
    return Math.max(discounted, 0.01);
  }
  if (discount.type === 'fixed_amount') {
    return Math.max(price - discount.value, 0.01);
  }
  // fixed_price: the final price becomes exactly `value` (flat price) — never
  // above the original price (a "discount" must not raise it) and never < 0.01.
  if (discount.type === 'fixed_price') {
    return Math.max(Math.min(discount.value, price), 0.01);
  }
  return price;
}

// ── Promo Code validation ─────────────────────────────────────────────────────

export function validatePromoCode(code, cartItems, subtotal, lang = 'en') {
  const t = (en, ar) => lang === 'ar' ? ar : en;
  if (!code) return { valid: false, reason: t('No promo code entered.', 'لم يتم إدخال رمز ترويجي.') };
  if (!code.is_active) return { valid: false, reason: t('This code is inactive.', 'هذا الرمز غير فعّال.') };

  const now = Date.now();
  if (code.valid_from && new Date(code.valid_from).getTime() > now)
    return { valid: false, reason: t('This code is not valid yet.', 'هذا الرمز غير صالح بعد.') };
  if (code.valid_until && new Date(code.valid_until).getTime() < now)
    return { valid: false, reason: t('This code has expired.', 'انتهت صلاحية هذا الرمز.') };

  if (code.min_order_usd && subtotal < code.min_order_usd)
    return { valid: false, reason: t(`Minimum order is $${code.min_order_usd}.`, `الحد الأدنى للطلب هو $${code.min_order_usd}.`) };

  if (code.usage_limit && code.times_used >= code.usage_limit)
    return { valid: false, reason: t('This code has reached its usage limit.', 'وصل هذا الرمز إلى حد استخدامه.') };

  return { valid: true };
}

export function calcPromoDiscount(code, cartItems, subtotal) {
  if (!code) return 0;
  if (code.type === 'free_shipping') return 0; // handled separately
  if (code.type === 'percentage') return parseFloat(((subtotal * code.value) / 100).toFixed(2));
  if (code.type === 'fixed_amount') return Math.min(code.value, subtotal);
  return 0;
}
