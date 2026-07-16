import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableQty, productAvailableQty } from '../src/lib/availability.js';

// ── availableQty: on-hand minus reserved, clamped at zero ──────────────────────

test('availableQty subtracts reserved from on_hand for a variant', () => {
  assert.equal(availableQty({ qty_on_hand: 5, qty_reserved: 2 }), 3);
});

test('availableQty is zero when everything is reserved (1 on hand, 1 reserved)', () => {
  assert.equal(availableQty({ qty_on_hand: 1, qty_reserved: 1 }), 0);
});

test('availableQty uses stock_quantity for a simple product', () => {
  assert.equal(availableQty({ stock_quantity: 10, qty_reserved: 4 }), 6);
});

test('availableQty prefers qty_on_hand over stock_quantity when both present', () => {
  assert.equal(availableQty({ qty_on_hand: 8, stock_quantity: 99, qty_reserved: 3 }), 5);
});

test('availableQty treats missing fields as zero', () => {
  assert.equal(availableQty({}), 0);
  assert.equal(availableQty(null), 0);
  assert.equal(availableQty(undefined), 0);
});

test('availableQty never returns a negative number (over-reserved)', () => {
  assert.equal(availableQty({ qty_on_hand: 2, qty_reserved: 5 }), 0);
});

test('availableQty treats a bare on-hand with no reserved field as fully available', () => {
  assert.equal(availableQty({ qty_on_hand: 7 }), 7);
});

// ── productAvailableQty: sum across variants, else the simple product ───────────

test('productAvailableQty sums availableQty across variants', () => {
  const product = { has_variants: true };
  const variants = [
    { qty_on_hand: 5, qty_reserved: 2 }, // 3
    { qty_on_hand: 4, qty_reserved: 4 }, // 0
    { qty_on_hand: 1, qty_reserved: 0 }, // 1
  ];
  assert.equal(productAvailableQty(product, variants), 4);
});

test('productAvailableQty is zero only when ALL variants are unavailable', () => {
  const product = { has_variants: true };
  const variants = [
    { qty_on_hand: 3, qty_reserved: 3 },
    { qty_on_hand: 2, qty_reserved: 5 },
  ];
  assert.equal(productAvailableQty(product, variants), 0);
});

test('productAvailableQty falls back to the simple product when no variants', () => {
  assert.equal(productAvailableQty({ stock_quantity: 6, qty_reserved: 1 }, []), 5);
});

test('productAvailableQty uses the product itself when has_variants is false', () => {
  const product = { has_variants: false, stock_quantity: 9, qty_reserved: 2 };
  const variants = [{ qty_on_hand: 100, qty_reserved: 0 }];
  assert.equal(productAvailableQty(product, variants), 7);
});

test('productAvailableQty returns zero for a missing product', () => {
  assert.equal(productAvailableQty(null), 0);
});
