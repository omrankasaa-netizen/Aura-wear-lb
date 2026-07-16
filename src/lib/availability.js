// Customer-facing availability: how many units a NEW shopper can order right now.
//
// The reservation backend (PR #38) holds stock via qty_reserved the moment an
// order is placed, so raw on-hand overstates what's actually buyable. Every
// storefront read of "is it in stock / how many left / what's the max" must
// subtract reserved holds. This is the single source of that formula.
//
// Kept framework-free (no React, no path aliases) so it can be imported by both
// the browser bundle and the Node test runner, mirroring src/lib/orderPricing.js.

/** Units available for a simple product OR a single variant. Never negative. */
export function availableQty(productOrVariant) {
  if (!productOrVariant) return 0;
  const onHand = productOrVariant.qty_on_hand ?? productOrVariant.stock_quantity ?? 0;
  const reserved = productOrVariant.qty_reserved ?? 0;
  return Math.max(0, onHand - reserved);
}

/**
 * Overall availability for a product. For variant products it's the SUM of each
 * variant's availableQty (a product is out of stock only when ALL variants are
 * unavailable); otherwise it's the simple product's own availableQty.
 */
export function productAvailableQty(product, variants = []) {
  if (!product) return 0;
  if (product.has_variants && variants.length > 0) {
    return variants.reduce((sum, v) => sum + availableQty(v), 0);
  }
  return availableQty(product);
}
