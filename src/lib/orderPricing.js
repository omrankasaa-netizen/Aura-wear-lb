/**
 * Manual-order pricing math — shared by the admin New Order form and its tests.
 *
 * Kept framework-free (no React, no path aliases) so it can be imported both by
 * the browser bundle and by the Node test runner. Discount resolution reuses the
 * SAME storefront logic in ./discounts.js so manual pricing matches the shop.
 */
import { getBestDiscount, applyDiscountToPrice } from './discounts.js';

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Effective per-unit price for a product, mirroring the storefront/cart badge:
 * base price (variant overrides product) with the best live auto-discount applied.
 */
export function effectiveUnitPrice(product, discounts = [], variant = null) {
  const base = Number(variant?.price_usd ?? product?.price_usd) || 0;
  const discount = getBestDiscount(discounts || [], { ...product, price_usd: base });
  return round2(discount ? applyDiscountToPrice(discount, base) : base);
}

export function lineTotal(item) {
  return round2((Number(item.unit_price_usd) || 0) * (Number(item.quantity) || 0));
}

export function calcSubtotal(items = []) {
  return round2(items.reduce((s, i) => s + lineTotal(i), 0));
}

/**
 * Resolve an order-level discount to a USD amount.
 * type: 'percent' | 'fixed'. Result is clamped to [0, subtotal].
 */
export function calcOrderDiscount(subtotal, type, value) {
  const sub = Number(subtotal) || 0;
  const v = Number(value) || 0;
  if (v <= 0) return 0;
  const amount = type === 'percent' ? (sub * v) / 100 : v;
  return round2(Math.min(Math.max(amount, 0), sub));
}

/** Auto total = subtotal − order discount + delivery fee, floored at 0. */
export function calcAutoTotal({ subtotal, orderDiscount, deliveryFee }) {
  const total = (Number(subtotal) || 0) - (Number(orderDiscount) || 0) + (Number(deliveryFee) || 0);
  return round2(Math.max(total, 0));
}

/**
 * Compute every stored money field for a manual order.
 *
 * @returns {{
 *   subtotal:number, orderDiscount:number, deliveryFee:number,
 *   autoTotal:number, grandTotal:number, totalOverridden:boolean
 * }}
 * grandTotal is what revenue/analytics reads. When finalTotalOverride is a
 * number that differs from autoTotal, it wins and totalOverridden is flagged.
 */
export function computeOrderTotals({
  items = [],
  orderDiscountType = 'fixed',
  orderDiscountValue = 0,
  deliveryFee = 0,
  finalTotalOverride = null,
} = {}) {
  const subtotal = calcSubtotal(items);
  const orderDiscount = calcOrderDiscount(subtotal, orderDiscountType, orderDiscountValue);
  const fee = round2(deliveryFee);
  const autoTotal = calcAutoTotal({ subtotal, orderDiscount, deliveryFee: fee });

  const hasOverride =
    finalTotalOverride !== null &&
    finalTotalOverride !== undefined &&
    finalTotalOverride !== '' &&
    !Number.isNaN(Number(finalTotalOverride));
  const overrideVal = hasOverride ? round2(finalTotalOverride) : null;
  const totalOverridden = hasOverride && overrideVal !== autoTotal;
  const grandTotal = totalOverridden ? overrideVal : autoTotal;

  return { subtotal, orderDiscount, deliveryFee: fee, autoTotal, grandTotal, totalOverridden };
}
