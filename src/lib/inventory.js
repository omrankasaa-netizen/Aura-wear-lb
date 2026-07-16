import { base44 } from '@/api/base44Client';

/**
 * Inventory helper — wraps the inventoryEngine backend function.
 */

// Customer-facing availability helpers live in a framework-free module so they
// can be unit-tested under `node --test`; re-exported here so callers keep a
// single, discoverable import point alongside stockStatus().
export { availableQty, productAvailableQty } from './availability.js';

export async function checkOrderStock(orderId) {
  const res = await base44.functions.invoke('inventoryEngine', { action: 'check_stock', order_id: orderId });
  return res.data;
}

/** Reserve (hold) stock the moment an order is placed, before admin confirmation. */
export async function reserveOrderStock(orderId) {
  const res = await base44.functions.invoke('inventoryEngine', { action: 'reserve_stock', order_id: orderId });
  return res.data;
}

export async function commitOrderStock(orderId) {
  const res = await base44.functions.invoke('inventoryEngine', { action: 'commit_stock', order_id: orderId });
  return res.data;
}

export async function releaseOrderStock(orderId) {
  const res = await base44.functions.invoke('inventoryEngine', { action: 'release_stock', order_id: orderId });
  return res.data;
}

export async function manualStockAdjust({ productId, variantSku, newQty, movementType, reason }) {
  const res = await base44.functions.invoke('inventoryEngine', {
    action: 'manual_adjust',
    product_id: productId,
    variant_sku: variantSku || null,
    new_qty: newQty,
    movement_type: movementType,
    reason,
  });
  return res.data;
}

/** Commit stock when order is confirmed */
export async function commitStock({ orderId }) {
  const res = await base44.functions.invoke('inventoryEngine', { action: 'commit_stock', order_id: orderId });
  return res.data;
}

/** Release stock when order is cancelled */
export async function releaseStock({ orderId }) {
  const res = await base44.functions.invoke('inventoryEngine', { action: 'release_stock', order_id: orderId });
  return res.data;
}

/** Stock status label for display */
export function stockStatus(qty, reorderLevel = 3) {
  if (qty <= 0) return { label: 'Out of stock', color: 'text-destructive bg-destructive/10' };
  if (qty <= reorderLevel) return { label: 'Low stock', color: 'text-amber-600 bg-amber-50' };
  return { label: 'In stock', color: 'text-green-700 bg-green-50' };
}