import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveUnitPrice, calcSubtotal, calcOrderDiscount, calcAutoTotal, computeOrderTotals,
} from '../src/lib/orderPricing.js';

// ── effectiveUnitPrice: mirrors storefront auto-discounts ──────────────────────

test('effectiveUnitPrice returns base price when no live discount matches', () => {
  const product = { id: 'p1', price_usd: 40 };
  assert.equal(effectiveUnitPrice(product, []), 40);
});

test('effectiveUnitPrice applies a live percentage discount (default order pricing)', () => {
  const product = { id: 'p1', price_usd: 40 };
  const discounts = [{ is_active: true, applies_to: 'all_products', type: 'percentage', value: 25 }];
  assert.equal(effectiveUnitPrice(product, discounts), 30); // 40 - 25%
});

test('effectiveUnitPrice applies a live fixed_amount discount', () => {
  const product = { id: 'p1', price_usd: 40 };
  const discounts = [{ is_active: true, applies_to: 'all_products', type: 'fixed_amount', value: 10 }];
  assert.equal(effectiveUnitPrice(product, discounts), 30);
});

test('effectiveUnitPrice ignores inactive/expired discounts', () => {
  const product = { id: 'p1', price_usd: 40 };
  const past = new Date(Date.now() - 86400000).toISOString();
  const discounts = [
    { is_active: false, applies_to: 'all_products', type: 'percentage', value: 50 },
    { is_active: true, ends_at: past, applies_to: 'all_products', type: 'percentage', value: 50 },
  ];
  assert.equal(effectiveUnitPrice(product, discounts), 40);
});

test('effectiveUnitPrice uses variant price as the base when provided', () => {
  const product = { id: 'p1', price_usd: 40 };
  const discounts = [{ is_active: true, applies_to: 'all_products', type: 'percentage', value: 10 }];
  assert.equal(effectiveUnitPrice(product, discounts, { price_usd: 50 }), 45); // 50 - 10%
});

// ── subtotal from (possibly overridden) line prices ────────────────────────────

test('calcSubtotal sums unit_price * qty across items', () => {
  const items = [
    { unit_price_usd: 30, quantity: 2 },
    { unit_price_usd: 15.5, quantity: 1 },
  ];
  assert.equal(calcSubtotal(items), 75.5);
});

test('calcSubtotal reflects per-item price overrides', () => {
  const items = [{ unit_price_usd: 12.34, quantity: 3 }]; // admin override
  assert.equal(calcSubtotal(items), 37.02);
});

// ── order-level discount: $ and %, clamped ─────────────────────────────────────

test('calcOrderDiscount fixed amount', () => {
  assert.equal(calcOrderDiscount(100, 'fixed', 15), 15);
});

test('calcOrderDiscount percentage', () => {
  assert.equal(calcOrderDiscount(80, 'percent', 25), 20);
});

test('calcOrderDiscount is clamped to the subtotal (cannot exceed it)', () => {
  assert.equal(calcOrderDiscount(50, 'fixed', 999), 50);
  assert.equal(calcOrderDiscount(50, 'percent', 500), 50);
});

test('calcOrderDiscount of zero/negative yields 0', () => {
  assert.equal(calcOrderDiscount(50, 'fixed', 0), 0);
  assert.equal(calcOrderDiscount(50, 'percent', -5), 0);
});

// ── auto total ─────────────────────────────────────────────────────────────────

test('calcAutoTotal = subtotal - discount + delivery, floored at 0', () => {
  assert.equal(calcAutoTotal({ subtotal: 100, orderDiscount: 20, deliveryFee: 5 }), 85);
  assert.equal(calcAutoTotal({ subtotal: 10, orderDiscount: 50, deliveryFee: 0 }), 0);
});

// ── full computeOrderTotals + final-total override ─────────────────────────────

test('computeOrderTotals: auto path stores correct adjusted total (no override)', () => {
  const r = computeOrderTotals({
    items: [{ unit_price_usd: 30, quantity: 2 }], // discounted line prices
    orderDiscountType: 'percent', orderDiscountValue: 10,
    deliveryFee: 5,
  });
  assert.equal(r.subtotal, 60);
  assert.equal(r.orderDiscount, 6);
  assert.equal(r.deliveryFee, 5);
  assert.equal(r.autoTotal, 59); // 60 - 6 + 5
  assert.equal(r.grandTotal, 59);
  assert.equal(r.totalOverridden, false);
});

test('computeOrderTotals: waived delivery fee (0)', () => {
  const r = computeOrderTotals({
    items: [{ unit_price_usd: 25, quantity: 1 }],
    deliveryFee: 0,
  });
  assert.equal(r.autoTotal, 25);
  assert.equal(r.grandTotal, 25);
});

test('computeOrderTotals: final-total override wins and is flagged', () => {
  const r = computeOrderTotals({
    items: [{ unit_price_usd: 30, quantity: 2 }],
    orderDiscountType: 'fixed', orderDiscountValue: 0,
    deliveryFee: 5,
    finalTotalOverride: 50, // admin forces 50 instead of auto 65
  });
  assert.equal(r.autoTotal, 65);
  assert.equal(r.grandTotal, 50);
  assert.equal(r.totalOverridden, true);
});

test('computeOrderTotals: override equal to auto total is NOT flagged', () => {
  const r = computeOrderTotals({
    items: [{ unit_price_usd: 30, quantity: 2 }],
    deliveryFee: 5,
    finalTotalOverride: 65,
  });
  assert.equal(r.grandTotal, 65);
  assert.equal(r.totalOverridden, false);
});

test('computeOrderTotals: blank override falls back to auto total', () => {
  const r = computeOrderTotals({
    items: [{ unit_price_usd: 20, quantity: 1 }],
    deliveryFee: 3,
    finalTotalOverride: '',
  });
  assert.equal(r.grandTotal, 23);
  assert.equal(r.totalOverridden, false);
});

test('computeOrderTotals: empty order is all zeros', () => {
  const r = computeOrderTotals({ items: [] });
  assert.equal(r.subtotal, 0);
  assert.equal(r.grandTotal, 0);
  assert.equal(r.totalOverridden, false);
});
