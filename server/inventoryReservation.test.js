import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

// Point the DB at a throwaway file BEFORE db.js is (dynamically) imported so the
// real reservation code runs against an isolated schema, not the app data.db.
process.env.MINIYO_DB_PATH = path.join(os.tmpdir(), `aura-inv-test-${process.pid}-${Date.now()}.db`);
process.env.MINIYO_JOURNAL_MODE = 'DELETE';

let dbmod;
let inv;

before(async () => {
  dbmod = await import('./db.js');
  dbmod.initSchema();
  inv = await import('./functions.js');
});

const USER = { email: 'tester@aura-lb.shop' };

// ── seed helpers ──────────────────────────────────────────────────────────────
function makeSimpleProduct(stock) {
  return dbmod.createRecord('Product', {
    name: `Simple ${Math.random()}`, has_variants: false,
    stock_quantity: stock, qty_reserved: 0,
  });
}

function makeVariantProduct(onHand) {
  const p = dbmod.createRecord('Product', { name: `Variant ${Math.random()}`, has_variants: true });
  const v = dbmod.createRecord('ProductVariant', {
    product_id: p.id, variant_sku: `SKU-${Math.random().toString(36).slice(2, 8)}`,
    size: 'M', color: 'Black', qty_on_hand: onHand, qty_reserved: 0,
  });
  return { product: p, variant: v };
}

function makeOrder(extra = {}) {
  return dbmod.createRecord('Order', {
    order_number: `AURA-${Math.floor(Math.random() * 99999)}`,
    order_status: 'New', stock_committed: false, ...extra,
  });
}

function addSimpleItem(orderId, productId, name, qty) {
  return dbmod.createRecord('OrderItem', {
    order_id: orderId, product_id: productId, product_name: name, quantity: qty,
  });
}

function addVariantItem(orderId, productId, name, qty) {
  return dbmod.createRecord('OrderItem', {
    order_id: orderId, product_id: productId, product_name: name,
    size: 'M', color: 'Black', quantity: qty,
  });
}

const getProduct = (id) => dbmod.getRecord('Product', id);
const getVariant = (id) => dbmod.getRecord('ProductVariant', id);
const getOrder = (id) => dbmod.getRecord('Order', id);

// ── Simple product (stock_quantity + qty_reserved) ────────────────────────────

test('reserve immediately reduces availability without touching on-hand', () => {
  const p = makeSimpleProduct(1);
  const o = makeOrder();
  addSimpleItem(o.id, p.id, p.name, 1);

  const res = inv.reserveStock({ order_id: o.id }, USER);
  assert.equal(res.ok, true);

  const fresh = getProduct(p.id);
  assert.equal(fresh.stock_quantity, 1, 'on-hand physical count unchanged');
  assert.equal(fresh.qty_reserved, 1, 'reserved incremented');
  assert.equal(getOrder(o.id).stock_reserved, true);

  // available = 1 - 1 = 0 → a check for another unit is now short.
  const other = makeOrder();
  addSimpleItem(other.id, p.id, p.name, 1);
  assert.equal(inv.checkStock({ order_id: other.id }).ok, false);
});

test('second order for the last unit is REJECTED at placement (core bug)', () => {
  const p = makeSimpleProduct(1);
  const o1 = makeOrder();
  addSimpleItem(o1.id, p.id, p.name, 1);
  const o2 = makeOrder();
  addSimpleItem(o2.id, p.id, p.name, 1);

  assert.equal(inv.reserveStock({ order_id: o1.id }, USER).ok, true);

  const res2 = inv.reserveStock({ order_id: o2.id }, USER);
  assert.equal(res2.ok, false);
  assert.equal(res2._status, 409);
  assert.ok(res2.shortages.length >= 1);
  // Rejected order is cancelled so it doesn't linger holding nothing.
  assert.equal(getOrder(o2.id).order_status, 'Cancelled');
  assert.equal(getProduct(p.id).qty_reserved, 1, 'loser did not reserve anything');
});

test('cancellation of a reserved (uncommitted) order restores availability', () => {
  const p = makeSimpleProduct(1);
  const o1 = makeOrder();
  addSimpleItem(o1.id, p.id, p.name, 1);
  inv.reserveStock({ order_id: o1.id }, USER);

  const rel = inv.releaseStock({ order_id: o1.id }, USER);
  assert.equal(rel.ok, true);
  const fresh = getProduct(p.id);
  assert.equal(fresh.qty_reserved, 0, 'hold released');
  assert.equal(fresh.stock_quantity, 1);
  assert.equal(getOrder(o1.id).stock_reserved, false);

  // Now a new order can reserve the freed unit.
  const o2 = makeOrder();
  addSimpleItem(o2.id, p.id, p.name, 1);
  assert.equal(inv.reserveStock({ order_id: o2.id }, USER).ok, true);
});

test('confirmation converts reserve→sale with net-zero availability change', () => {
  const p = makeSimpleProduct(1);
  const o = makeOrder();
  addSimpleItem(o.id, p.id, p.name, 1);
  inv.reserveStock({ order_id: o.id }, USER); // reserved=1, on_hand=1, available=0

  const commit = inv.commitStock({ order_id: o.id }, USER);
  assert.equal(commit.ok, true);
  const fresh = getProduct(p.id);
  assert.equal(fresh.stock_quantity, 0, 'on-hand deducted');
  assert.equal(fresh.qty_reserved, 0, 'reservation consumed');
  // available was 0 before and after — net zero, no oversell.
  assert.equal((fresh.stock_quantity || 0) - (fresh.qty_reserved || 0), 0);
  assert.equal(getOrder(o.id).stock_committed, true);
});

test('cancellation AFTER commit restocks on-hand', () => {
  const p = makeSimpleProduct(1);
  const o = makeOrder();
  addSimpleItem(o.id, p.id, p.name, 1);
  inv.reserveStock({ order_id: o.id }, USER);
  inv.commitStock({ order_id: o.id }, USER); // on_hand=0
  const rel = inv.releaseStock({ order_id: o.id }, USER);
  assert.equal(rel.ok, true);
  assert.equal(getProduct(p.id).stock_quantity, 1, 'physical stock returned');
});

// ── Variant product (qty_on_hand + qty_reserved) ──────────────────────────────

test('variant: reserve holds the last unit and blocks a second reservation', () => {
  const { product, variant } = makeVariantProduct(1);
  const o1 = makeOrder();
  addVariantItem(o1.id, product.id, product.name, 1);
  const o2 = makeOrder();
  addVariantItem(o2.id, product.id, product.name, 1);

  assert.equal(inv.reserveStock({ order_id: o1.id }, USER).ok, true);
  assert.equal(getVariant(variant.id).qty_reserved, 1);
  assert.equal(getVariant(variant.id).qty_on_hand, 1);

  assert.equal(inv.reserveStock({ order_id: o2.id }, USER).ok, false);
});

test('variant: confirm then cancel round-trips on-hand back', () => {
  const { product, variant } = makeVariantProduct(2);
  const o = makeOrder();
  addVariantItem(o.id, product.id, product.name, 2);
  inv.reserveStock({ order_id: o.id }, USER);
  inv.commitStock({ order_id: o.id }, USER);
  assert.equal(getVariant(variant.id).qty_on_hand, 0);
  assert.equal(getVariant(variant.id).qty_reserved, 0);
  inv.releaseStock({ order_id: o.id }, USER);
  assert.equal(getVariant(variant.id).qty_on_hand, 2);
});

// ── Legacy orders (never reserved) ────────────────────────────────────────────

test('legacy order (no stock_reserved) still commits via on-hand fallback', () => {
  const { product, variant } = makeVariantProduct(3);
  const o = makeOrder(); // stock_reserved never set
  addVariantItem(o.id, product.id, product.name, 2);

  const commit = inv.commitStock({ order_id: o.id }, USER);
  assert.equal(commit.ok, true);
  const v = getVariant(variant.id);
  assert.equal(v.qty_on_hand, 1, 'on-hand deducted');
  assert.equal(v.qty_reserved, 0, 'reserved untouched for legacy order');
});

test('legacy committed order releases (restocks) correctly', () => {
  const p = makeSimpleProduct(5);
  const o = makeOrder();
  addSimpleItem(o.id, p.id, p.name, 2);
  inv.commitStock({ order_id: o.id }, USER); // legacy fallback → stock 3
  assert.equal(getProduct(p.id).stock_quantity, 3);
  inv.releaseStock({ order_id: o.id }, USER);
  assert.equal(getProduct(p.id).stock_quantity, 5, 'restocked');
});

// ── No-negative + idempotency ─────────────────────────────────────────────────

test('reserve is idempotent — double call does not double-hold', () => {
  const p = makeSimpleProduct(5);
  const o = makeOrder();
  addSimpleItem(o.id, p.id, p.name, 2);
  inv.reserveStock({ order_id: o.id }, USER);
  const second = inv.reserveStock({ order_id: o.id }, USER);
  assert.match(second.message || '', /already reserved/);
  assert.equal(getProduct(p.id).qty_reserved, 2, 'not doubled');
});

test('commit is idempotent — double call does not double-deduct', () => {
  const p = makeSimpleProduct(5);
  const o = makeOrder();
  addSimpleItem(o.id, p.id, p.name, 2);
  inv.reserveStock({ order_id: o.id }, USER);
  inv.commitStock({ order_id: o.id }, USER);
  const second = inv.commitStock({ order_id: o.id }, USER);
  assert.match(second.message || '', /already committed/);
  assert.equal(getProduct(p.id).stock_quantity, 3, 'deducted exactly once');
});

test('release is idempotent — double call does not double-restore', () => {
  const p = makeSimpleProduct(1);
  const o = makeOrder();
  addSimpleItem(o.id, p.id, p.name, 1);
  inv.reserveStock({ order_id: o.id }, USER);
  inv.releaseStock({ order_id: o.id }, USER);
  const second = inv.releaseStock({ order_id: o.id }, USER);
  assert.match(second.message || '', /nothing to release/);
  assert.equal(getProduct(p.id).qty_reserved, 0);
  assert.equal(getProduct(p.id).stock_quantity, 1, 'on-hand not inflated');
});

test('counts never go negative (clamped)', () => {
  // A malformed state: reserved smaller than the order qty. Commit must clamp.
  const p = makeSimpleProduct(1);
  const o = makeOrder({ stock_reserved: true }); // pretend reserved path
  addSimpleItem(o.id, p.id, p.name, 5); // more than on-hand/reserved
  inv.commitStock({ order_id: o.id }, USER);
  const fresh = getProduct(p.id);
  assert.equal(fresh.stock_quantity, 0, 'on-hand clamped at 0');
  assert.equal(fresh.qty_reserved, 0, 'reserved clamped at 0');
});

test('all-or-nothing: a multi-line order with one short line reserves nothing', () => {
  const a = makeSimpleProduct(5);
  const b = makeSimpleProduct(0); // out of stock
  const o = makeOrder();
  addSimpleItem(o.id, a.id, a.name, 1);
  addSimpleItem(o.id, b.id, b.name, 1);

  const res = inv.reserveStock({ order_id: o.id }, USER);
  assert.equal(res.ok, false);
  assert.equal(getProduct(a.id).qty_reserved, 0, 'no partial reservation');
});
