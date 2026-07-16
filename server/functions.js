import { db, createRecord, getRecord, updateRecord, queryRecords, bulkCreate, nowIso } from './db.js';
import { sendEmail } from './email.js';
import { ADMIN_TOOLS, ADMIN_TOOL_GUARDS } from './adminTools.js';
import { sendPurchaseCapi, isCapiConfigured } from './meta.js';

// ─── Brand / email constants ────────────────────────────────────────────────
// Public site base used for links inside automated emails.
const STORE_BASE_URL = 'https://aura-lb.shop';
const STORE_NAME = 'AURA WEAR';
const SUPPORT_EMAIL = 'support@aura-lb.shop';

// First token of a name; falls back to the provided default ("there", local-part…).
function firstName(name, fallback = 'there') {
  const tok = String(name || '').trim().split(/\s+/)[0];
  return tok || fallback;
}

// Format a date for email body, e.g. "June 17, 2026".
function formatOrderDate(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Pre-rendered <table> of order items for the branded order emails.
function orderItemsTableHtml(items) {
  const td = 'padding:10px 8px;border-bottom:1px solid #ece7df;font-size:14px;color:#1a1a1a;';
  const tdR = td + 'text-align:right;white-space:nowrap;';
  const th = 'padding:8px;border-bottom:2px solid #111111;font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:.8px;font-weight:600;';
  const rows = items.map((it) =>
    `<tr><td style="${td}">${it.product_name}${[it.size, it.color].filter(Boolean).length ? ` <span style="color:#8a8a8a;font-size:12px;">${[it.size, it.color].filter(Boolean).join(' / ')}</span>` : ''}</td><td style="${tdR}">×${it.quantity}</td><td style="${tdR}">$${Number(it.unit_price_usd || 0).toFixed(2)}</td><td style="${tdR}">$${Number(it.line_total_usd || 0).toFixed(2)}</td></tr>`
  ).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 4px;">`
    + `<thead><tr>`
    + `<th align="left" style="${th}">Item</th>`
    + `<th align="right" style="${th}">Qty</th>`
    + `<th align="right" style="${th}">Price</th>`
    + `<th align="right" style="${th}">Total</th>`
    + `</tr></thead><tbody>${rows}</tbody></table>`;
}

// Shared branded HTML wrapper for direct customer emails. AURA editorial palette
// (#111111 black header, beige #efe9df background, olive #5A5E45 accent button),
// inline styles only (email-safe).
function emailShell(headingHtml, bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 0;"><tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:4px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);">
        <tr><td style="background:#111111;padding:24px 28px;"><span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:4px;">AURA WEAR</span></td></tr>
        <tr><td style="padding:30px 28px;">${headingHtml}${bodyHtml}</td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #ece7df;font-size:12px;color:#8a8a8a;">
          Need help? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:#5A5E45;">${SUPPORT_EMAIL}</a> · AURA WEAR · aura-lb.shop
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

function btn(href, label) {
  return `<p style="margin:26px 0;"><a href="${href}" style="display:inline-block;background:#111111;color:#fff;text-decoration:none;padding:13px 26px;border-radius:2px;font-weight:600;letter-spacing:1px;text-transform:uppercase;font-size:13px;">${label}</a></p>`;
}

// All functions return a plain object. The HTTP layer wraps it as { data, status }.
// `user` is the authenticated user (or null for public-invokable functions).

// ─── Inventory Engine ───────────────────────────────────────────────────────
async function getProductById(productId) {
  const r = queryRecords('Product', { query: { id: productId }, limit: 1 });
  return r[0] || null;
}

async function getVariant(productId, size, color) {
  const all = queryRecords('ProductVariant', { query: { product_id: productId } });
  return all.find((v) =>
    (size ? v.size === size : true) && (color ? v.color === color : true)
  ) || null;
}

function checkStock({ order_id }) {
  const items = queryRecords('OrderItem', { query: { order_id } });
  const shortages = [];
  for (const item of items) {
    const product = queryRecords('Product', { query: { id: item.product_id }, limit: 1 })[0];
    if (!product) continue;
    if ((product.has_variants && item.size) || item.color) {
      const variant = queryRecords('ProductVariant', { query: { product_id: item.product_id } })
        .find((v) => (item.size ? v.size === item.size : true) && (item.color ? v.color === item.color : true));
      if (!variant) {
        shortages.push({ name: item.product_name, available: 0, needed: item.quantity, reason: 'Variant not found' });
        continue;
      }
      const available = (variant.qty_on_hand || 0) - (variant.qty_reserved || 0);
      if (available < item.quantity) {
        shortages.push({ name: `${item.product_name} (${[item.size, item.color].filter(Boolean).join(', ')})`, available, needed: item.quantity });
      }
    } else {
      const available = (product.stock_quantity || 0) - (product.qty_reserved || 0);
      if (available < item.quantity) {
        shortages.push({ name: item.product_name, available, needed: item.quantity });
      }
    }
  }
  return { ok: shortages.length === 0, shortages };
}

// Resolve an order line to its stock-bearing record. Variants carry
// qty_on_hand/qty_reserved; simple products carry stock_quantity (with a
// qty_reserved counter added by the reservation lifecycle).
function resolveLineTarget(item) {
  const product = queryRecords('Product', { query: { id: item.product_id }, limit: 1 })[0];
  if (!product) return { product: null, variant: null };
  if (product.has_variants && (item.size || item.color)) {
    const variant = queryRecords('ProductVariant', { query: { product_id: item.product_id } })
      .find((v) => (item.size ? v.size === item.size : true) && (item.color ? v.color === item.color : true));
    return { product, variant: variant || null };
  }
  return { product, variant: null };
}

const clampNonNeg = (n) => (n < 0 ? 0 : n);

// ─── Reserve stock (order PLACEMENT) ─────────────────────────────────────────
// Atomically re-check availability AND hold the stock by incrementing the
// reserved counter, so a concurrent order for the same last unit cannot also
// pass. Availability is on_hand - reserved at variant level (or
// stock_quantity - qty_reserved for simple products). All-or-nothing: if ANY
// line is short the whole placement is rejected and nothing is reserved.
//
// Atomicity: better-sqlite3 is synchronous and Node runs it single-threaded, so
// the check→write critical section below never interleaves with another
// request; wrapping it in db.transaction() additionally makes the multi-line
// reservation all-or-nothing (BEGIN/COMMIT, ROLLBACK on throw).
function reserveStock({ order_id }, user) {
  const o = queryRecords('Order', { query: { id: order_id }, limit: 1 })[0];
  if (!o) return { _status: 404, error: 'Order not found' };
  if (o.stock_reserved) return { ok: true, message: 'Stock already reserved' };
  if (o.stock_committed) return { ok: true, message: 'Stock already committed' };

  const items = queryRecords('OrderItem', { query: { order_id } });
  const reason = `Order ${o.order_number || order_id} reserved`;
  const by = user?.email || 'system';

  const runReserve = db.transaction(() => {
    const shortages = [];
    const plan = [];
    // Pass 1 — read fresh availability for every line; collect shortages.
    for (const item of items) {
      const { product, variant } = resolveLineTarget(item);
      if (!product) {
        shortages.push({ name: item.product_name, available: 0, needed: item.quantity, reason: 'Product not found' });
        continue;
      }
      if (product.has_variants && (item.size || item.color)) {
        if (!variant) {
          shortages.push({ name: item.product_name, available: 0, needed: item.quantity, reason: 'Variant not found' });
          continue;
        }
        const available = (variant.qty_on_hand || 0) - (variant.qty_reserved || 0);
        if (available < item.quantity) {
          shortages.push({ name: `${item.product_name} (${[item.size, item.color].filter(Boolean).join(', ')})`, available, needed: item.quantity });
        } else {
          plan.push({ variant, product, item });
        }
      } else {
        const available = (product.stock_quantity || 0) - (product.qty_reserved || 0);
        if (available < item.quantity) {
          shortages.push({ name: item.product_name, available, needed: item.quantity });
        } else {
          plan.push({ product, item });
        }
      }
    }
    if (shortages.length) return { ok: false, shortages };

    // Pass 2 — hold the stock. qty_on_hand is untouched; only reserved rises.
    const movements = [];
    for (const { variant, product, item } of plan) {
      if (variant) {
        const prev = variant.qty_reserved || 0;
        const next = prev + item.quantity;
        updateRecord('ProductVariant', variant.id, { qty_reserved: next });
        movements.push({ product_id: item.product_id, variant_sku: variant.variant_sku, type: 'Reserved', quantity: -item.quantity, previous_stock: (variant.qty_on_hand || 0) - prev, new_stock: (variant.qty_on_hand || 0) - next, reason, created_at: nowIso(), created_by: by });
      } else {
        const prev = product.qty_reserved || 0;
        const next = prev + item.quantity;
        updateRecord('Product', item.product_id, { qty_reserved: next });
        movements.push({ product_id: item.product_id, type: 'Reserved', quantity: -item.quantity, previous_stock: (product.stock_quantity || 0) - prev, new_stock: (product.stock_quantity || 0) - next, reason, created_at: nowIso(), created_by: by });
      }
    }
    if (movements.length) bulkCreate('InventoryMovement', movements);
    updateRecord('Order', order_id, { stock_reserved: true });
    return { ok: true, movements_created: movements.length };
  });

  const result = runReserve();
  if (!result.ok) {
    // Nothing was held (all-or-nothing). Cancel the just-placed order so it does
    // not linger as a phantom that holds no stock; the client can't set order
    // status itself (generic Order writes are create-only for guests).
    if (o.order_status !== 'Cancelled') {
      updateRecord('Order', order_id, { order_status: 'Cancelled', stock_reserved: false });
    }
    return { _status: 409, ok: false, shortages: result.shortages };
  }
  return result;
}

// ─── Commit stock (order CONFIRMATION) ───────────────────────────────────────
// Converts a reservation into a sale: qty_on_hand -= qty AND qty_reserved -= qty
// (net availability change zero — the unit was already held). For LEGACY orders
// that were never reserved (no stock_reserved flag), falls back to the old
// behaviour of decrementing qty_on_hand only, guarded by a fresh availability
// check so historical orders can't oversell or go negative.
function commitStock({ order_id }, user) {
  const o = queryRecords('Order', { query: { id: order_id }, limit: 1 })[0];
  if (!o) return { _status: 404, error: 'Order not found' };
  if (o.stock_committed) return { ok: true, message: 'Stock already committed' };

  const wasReserved = !!o.stock_reserved;
  // Legacy orders were never reserved — verify availability before deducting.
  // Reserved orders already hold their stock, so a check here would wrongly see
  // their own reservation as unavailable; skip it.
  if (!wasReserved) {
    const check = checkStock({ order_id });
    if (!check.ok) return { _status: 409, ok: false, shortages: check.shortages };
  }

  const items = queryRecords('OrderItem', { query: { order_id } });
  const reason = `Order ${o.order_number || order_id} confirmed`;
  const by = user?.email || 'system';

  const runCommit = db.transaction(() => {
    const movements = [];
    for (const item of items) {
      const { product, variant } = resolveLineTarget(item);
      if (!product) continue;
      if (product.has_variants && (item.size || item.color)) {
        if (!variant) continue;
        const prev = variant.qty_on_hand || 0;
        const next = clampNonNeg(prev - item.quantity);
        const patch = { qty_on_hand: next };
        if (wasReserved) patch.qty_reserved = clampNonNeg((variant.qty_reserved || 0) - item.quantity);
        updateRecord('ProductVariant', variant.id, patch);
        movements.push({ product_id: item.product_id, variant_sku: variant.variant_sku, type: 'Sold', quantity: -item.quantity, previous_stock: prev, new_stock: next, reason, created_at: nowIso(), created_by: by });
      } else {
        const prev = product.stock_quantity || 0;
        const next = clampNonNeg(prev - item.quantity);
        const patch = { stock_quantity: next };
        if (wasReserved) patch.qty_reserved = clampNonNeg((product.qty_reserved || 0) - item.quantity);
        updateRecord('Product', item.product_id, patch);
        movements.push({ product_id: item.product_id, type: 'Sold', quantity: -item.quantity, previous_stock: prev, new_stock: next, reason, created_at: nowIso(), created_by: by });
      }
    }
    if (movements.length) bulkCreate('InventoryMovement', movements);
    updateRecord('Order', order_id, { stock_committed: true });
    return { ok: true, movements_created: movements.length };
  });

  return runCommit();
}

// ─── Release stock (order CANCELLATION — the only path that frees stock) ──────
// Two cases:
//   • committed (confirmed then cancelled): add back to qty_on_hand ("Returned"),
//     the original behaviour. Reserved was already zeroed at commit.
//   • reserved but not yet committed: drop the hold via qty_reserved -= qty
//     ("Released") so the unit becomes available again.
// Legacy orders that were never reserved or committed have nothing to free.
function releaseStock({ order_id }, user) {
  const o = queryRecords('Order', { query: { id: order_id }, limit: 1 })[0];
  if (!o) return { _status: 404, error: 'Order not found' };
  if (!o.stock_committed && !o.stock_reserved) {
    return { ok: true, message: 'Stock was never reserved or committed, nothing to release' };
  }

  const committed = !!o.stock_committed;
  const items = queryRecords('OrderItem', { query: { order_id } });
  const reason = `Order ${o.order_number || order_id} cancelled`;
  const by = user?.email || 'system';

  const runRelease = db.transaction(() => {
    const movements = [];
    for (const item of items) {
      const { product, variant } = resolveLineTarget(item);
      if (!product) continue;
      const isVariant = product.has_variants && (item.size || item.color);
      if (isVariant && !variant) continue;

      if (committed) {
        // Restock physical inventory.
        if (isVariant) {
          const prev = variant.qty_on_hand || 0;
          const next = prev + item.quantity;
          updateRecord('ProductVariant', variant.id, { qty_on_hand: next });
          movements.push({ product_id: item.product_id, variant_sku: variant.variant_sku, type: 'Returned', quantity: item.quantity, previous_stock: prev, new_stock: next, reason, created_at: nowIso(), created_by: by });
        } else {
          const prev = product.stock_quantity || 0;
          const next = prev + item.quantity;
          updateRecord('Product', item.product_id, { stock_quantity: next });
          movements.push({ product_id: item.product_id, type: 'Returned', quantity: item.quantity, previous_stock: prev, new_stock: next, reason, created_at: nowIso(), created_by: by });
        }
      } else {
        // Release the hold (reserved but not committed).
        if (isVariant) {
          const prevRes = variant.qty_reserved || 0;
          const nextRes = clampNonNeg(prevRes - item.quantity);
          updateRecord('ProductVariant', variant.id, { qty_reserved: nextRes });
          movements.push({ product_id: item.product_id, variant_sku: variant.variant_sku, type: 'Released', quantity: item.quantity, previous_stock: (variant.qty_on_hand || 0) - prevRes, new_stock: (variant.qty_on_hand || 0) - nextRes, reason, created_at: nowIso(), created_by: by });
        } else {
          const prevRes = product.qty_reserved || 0;
          const nextRes = clampNonNeg(prevRes - item.quantity);
          updateRecord('Product', item.product_id, { qty_reserved: nextRes });
          movements.push({ product_id: item.product_id, type: 'Released', quantity: item.quantity, previous_stock: (product.stock_quantity || 0) - prevRes, new_stock: (product.stock_quantity || 0) - nextRes, reason, created_at: nowIso(), created_by: by });
        }
      }
    }
    if (movements.length) bulkCreate('InventoryMovement', movements);
    updateRecord('Order', order_id, { stock_committed: false, stock_reserved: false });
    return { ok: true, movements_created: movements.length };
  });

  return runRelease();
}

function manualAdjust({ product_id, variant_sku, new_qty, movement_type, reason }, user) {
  if (!['Received', 'Correction', 'Damaged'].includes(movement_type)) {
    return { _status: 400, error: 'Invalid movement_type. Use Received, Correction, or Damaged.' };
  }
  let prev, delta;
  if (variant_sku) {
    const v = queryRecords('ProductVariant', { query: { variant_sku }, limit: 1 })[0];
    if (!v) return { _status: 404, error: 'Variant not found' };
    prev = v.qty_on_hand || 0;
    delta = new_qty - prev;
    updateRecord('ProductVariant', v.id, { qty_on_hand: new_qty });
  } else {
    const p = queryRecords('Product', { query: { id: product_id }, limit: 1 })[0];
    if (!p) return { _status: 404, error: 'Product not found' };
    prev = p.stock_quantity || 0;
    delta = new_qty - prev;
    updateRecord('Product', product_id, { stock_quantity: new_qty });
  }
  createRecord('InventoryMovement', {
    product_id,
    variant_sku: variant_sku || null,
    type: movement_type,
    quantity: delta,
    previous_stock: prev,
    new_stock: new_qty,
    reason: reason || `Manual ${movement_type.toLowerCase()} adjustment`,
    created_at: nowIso(),
    created_by: user?.email || 'system',
  });
  return { ok: true, previous_stock: prev, new_stock: new_qty, delta };
}

function inventoryEngine(body, user) {
  if (!user) return { _status: 401, error: 'Unauthorized' };
  const { action } = body;
  if (action === 'check_stock') return checkStock(body);
  if (action === 'reserve_stock') return reserveStock(body, user);
  if (action === 'commit_stock') return commitStock(body, user);
  if (action === 'release_stock') return releaseStock(body, user);
  if (action === 'manual_adjust') return manualAdjust(body, user);
  return { _status: 400, error: 'Unknown action' };
}

// ─── Membership Engine ──────────────────────────────────────────────────────
function membershipEngine(body) {
  const { action, customer_id } = body;
  const settings = queryRecords('MembershipSettings', {})[0] || {};

  const expiresAt = settings.credit_expiry_days && settings.credit_expiry_days > 0
    ? new Date(Date.now() + settings.credit_expiry_days * 86400000).toISOString()
    : null;

  if (action === 'grant_bronze_credits') {
    const bronzeCredits = settings.bronze_credits ?? 2;
    for (let i = 0; i < bronzeCredits; i++) {
      createRecord('FreeDeliveryCredit', {
        customer_id, source_tier: 'Bronze', granted_at: nowIso(), expires_at: expiresAt, status: 'available',
      });
    }
    if (customer_id && getRecord('Customer', customer_id)) {
      updateRecord('Customer', customer_id, {
        current_tier: 'Bronze', free_delivery_credits_remaining: bronzeCredits,
      });
    }
    return { success: true, creditsGranted: bronzeCredits };
  }

  if (action === 'check_tier_upgrade') {
    const customer = getRecord('Customer', customer_id);
    if (!customer) return { _status: 404, error: 'Customer not found' };
    const silverThreshold = settings.silver_threshold_usd ?? 100;
    const silverCredits = settings.silver_credits ?? 4;
    const goldThreshold = settings.gold_threshold_usd ?? 250;
    const goldCredits = settings.gold_credits ?? 6;
    const spend = customer.lifetime_spend_usd || 0;
    const currentTier = customer.current_tier || 'Bronze';
    let upgraded = false;
    let newTier = currentTier;

    if (currentTier !== 'Gold' && spend >= silverThreshold && !customer.silver_granted) {
      for (let i = 0; i < silverCredits; i++) {
        createRecord('FreeDeliveryCredit', { customer_id, source_tier: 'Silver', granted_at: nowIso(), expires_at: expiresAt, status: 'available' });
      }
      updateRecord('Customer', customer_id, {
        current_tier: 'Silver', silver_granted: true,
        free_delivery_credits_remaining: (customer.free_delivery_credits_remaining || 0) + silverCredits,
      });
      newTier = 'Silver';
      upgraded = true;
    }
    if (spend >= goldThreshold && !customer.gold_granted) {
      const fresh = getRecord('Customer', customer_id);
      for (let i = 0; i < goldCredits; i++) {
        createRecord('FreeDeliveryCredit', { customer_id, source_tier: 'Gold', granted_at: nowIso(), expires_at: expiresAt, status: 'available' });
      }
      updateRecord('Customer', customer_id, {
        current_tier: 'Gold', gold_granted: true,
        free_delivery_credits_remaining: (fresh.free_delivery_credits_remaining || 0) + goldCredits,
      });
      newTier = 'Gold';
      upgraded = true;
    }
    // Send a branded tier-upgrade email when the tier actually changed.
    // Best-effort and non-blocking (sendEmail never throws and always writes an
    // EmailLog row; the .catch keeps tier logic unblocked). Idempotency is
    // provided by the silver_granted/gold_granted flags above, so it sends only
    // once per tier.
    if (upgraded && newTier !== currentTier) {
      const recipient = customer.email
        || queryRecords('User', { query: { id: customer_id }, limit: 1 })[0]?.email
        || '';
      if (recipient) {
        const subject = `You've reached ${newTier} status at AURA WEAR`;
        const heading = `<h2 style="margin:0 0 14px;font-size:20px;font-weight:600;color:#111111;letter-spacing:.3px;">Congratulations — you're now ${escapeHtml(newTier)}.</h2>`;
        const bodyHtml = `<p style="margin:0 0 16px;color:#444;">You've been upgraded from ${escapeHtml(currentTier)} to ${escapeHtml(newTier)}. Enjoy your new member benefits.</p>
          ${btn(`${STORE_BASE_URL}/account/membership`, 'See your benefits')}`;
        sendEmail({
          to: recipient,
          subject,
          html: emailShell(heading, bodyHtml),
          email_type: 'membership_tier_updated',
          customer_id,
          trigger_event: 'membership.tier.updated',
        }).catch(() => {});
      }
    }
    return { upgraded, newTier };
  }

  if (action === 'consume_credit') {
    const credits = queryRecords('FreeDeliveryCredit', {
      query: { customer_id, status: 'available' }, sort: 'granted_at', limit: 1,
    });
    if (credits.length === 0) return { consumed: false, reason: 'No available credits' };
    const credit = credits[0];
    updateRecord('FreeDeliveryCredit', credit.id, { status: 'used', used_at: nowIso(), used_on_order: '' });
    const customer = getRecord('Customer', customer_id);
    const remaining = Math.max(0, (customer?.free_delivery_credits_remaining || 1) - 1);
    if (customer) updateRecord('Customer', customer_id, { free_delivery_credits_remaining: remaining });
    return { consumed: true, creditsRemaining: remaining };
  }

  if (action === 'expire_old_credits') {
    if (!settings.credit_expiry_days || settings.credit_expiry_days <= 0) return { expired: 0 };
    const credits = queryRecords('FreeDeliveryCredit', { query: { status: 'available' }, sort: '-granted_at', limit: 1000 });
    let expiredCount = 0;
    const now = new Date();
    for (const credit of credits) {
      if (credit.expires_at && new Date(credit.expires_at) < now) {
        updateRecord('FreeDeliveryCredit', credit.id, { status: 'expired' });
        const customer = getRecord('Customer', credit.customer_id);
        if (customer && customer.free_delivery_credits_remaining > 0) {
          updateRecord('Customer', credit.customer_id, { free_delivery_credits_remaining: customer.free_delivery_credits_remaining - 1 });
        }
        expiredCount++;
      }
    }
    return { expired: expiredCount };
  }

  return { _status: 400, error: 'Unknown action' };
}

// ─── Seed Shipping Zones ──────────────────────────────────────────────────────
export const DEFAULT_SHIPPING_ZONES = [
  { area_name: 'Tripoli', area_name_ar: 'طرابلس', fee_usd: 4, is_active: true, is_catchall: false, sort_order: 0 },
  { area_name: 'Koura', area_name_ar: 'الكورة', fee_usd: 4, is_active: true, is_catchall: false, sort_order: 1 },
  { area_name: 'Beirut', area_name_ar: 'بيروت', fee_usd: 5, is_active: true, is_catchall: false, sort_order: 2 },
  { area_name: 'Akkar', area_name_ar: 'عكار', fee_usd: 5, is_active: true, is_catchall: false, sort_order: 3 },
  { area_name: 'All other areas / districts', area_name_ar: 'جميع المناطق الأخرى', fee_usd: 6, is_active: true, is_catchall: true, sort_order: 99 },
];

function seedShippingZones(body, user) {
  if (user && user.role !== 'admin' && user.role !== 'super_admin') {
    return { _status: 403, error: 'Forbidden: Admin access required' };
  }
  const existing = queryRecords('ShippingZone', { sort: 'sort_order', limit: 100 });
  if (existing.length > 0) return { message: 'Zones already exist', count: existing.length };
  const created = bulkCreate('ShippingZone', DEFAULT_SHIPPING_ZONES);
  return { message: 'Default zones seeded', count: created.length };
}

// ─── Email functions ──────────────────────────────────────────────────────────
async function sendOrderConfirmation(body) {
  const { order_id } = body;
  if (!order_id) return { _status: 400, error: 'order_id required' };
  const order = getRecord('Order', order_id);
  if (!order) return { _status: 404, error: 'Order not found' };

  const already = queryRecords('EmailLog', {
    query: { email_type: 'order_confirmation', order_id, status: 'sent' }, sort: 'sent_at', limit: 1,
  });
  if (already.length > 0) return { status: 'already_sent', message: 'Confirmation email already sent for this order' };

  const items = queryRecords('OrderItem', { query: { order_id } });
  const orderDate = formatOrderDate(order.order_date || order.created_date);
  const orderTotal = `$${Number(order.grand_total_usd || 0).toFixed(2)}`;
  const giftHtml = order.is_gift
    ? `<div style="margin:16px 0;padding:12px 14px;border:1px solid #5A5E45;border-radius:2px;background:#f6f5ef;">
        <p style="margin:0;font-weight:700;color:#5A5E45;">This order is a gift</p>
        ${order.gift_wrapping ? '<p style="margin:4px 0 0;color:#5A5E45;">Gift wrapping requested.</p>' : ''}
        ${order.gift_message ? `<p style="margin:4px 0 0;color:#5A5E45;">Message: "${escapeHtml(order.gift_message)}"</p>` : ''}
        ${order.hide_invoice_price ? '<p style="margin:4px 0 0;color:#5A5E45;">Prices will be hidden on the packing slip.</p>' : ''}
      </div>`
    : '';
  const subject = `We received your order #${order.order_number}`;
  const heading = `<h2 style="margin:0 0 14px;font-size:20px;font-weight:600;color:#111111;letter-spacing:.3px;">Thank you, ${escapeHtml(firstName(order.customer_name))}.</h2>`;
  const bodyHtml = `<p style="margin:0 0 16px;color:#444;">We've received your order and will confirm it shortly.</p>
    <p style="margin:0 0 16px;color:#444;">Order <strong>#${escapeHtml(order.order_number)}</strong><br/>
    Date: ${escapeHtml(orderDate)}<br/>
    Total: <strong>${orderTotal}</strong></p>
    ${orderItemsTableHtml(items)}
    ${giftHtml}
    ${btn(`${STORE_BASE_URL}/account/orders/${order_id}`, 'View your order')}`;

  const result = await sendEmail({
    to: order.customer_email,
    subject,
    html: emailShell(heading, bodyHtml),
    email_type: 'order_confirmation',
    order_id,
    customer_id: order.customer_id || '',
    trigger_event: 'order.submitted',
  });
  return { status: result.status, log_id: result.log_id };
}

// Admin notification email with full order details (incl. gift flags).
async function sendOrderNotification(body) {
  const { order_id } = body;
  if (!order_id) return { _status: 400, error: 'order_id required' };
  const order = getRecord('Order', order_id);
  if (!order) return { _status: 404, error: 'Order not found' };

  // Order-alert recipients. The store owner's Gmail always gets a copy so new
  // orders are never missed; any MINIYO_ADMIN_EMAIL / MINIYO_ORDER_ALERT_EMAILS
  // (comma-separated) are merged in. De-duped, case-insensitive. The seed
  // super-admin placeholder (admin@aura.store) is excluded because it is not a
  // real mailbox and would bounce / hurt sender reputation.
  const PLACEHOLDER_RECIPIENTS = new Set(['admin@aura.store', 'admin@miniyo.store', 'management@miniyo.store']);
  const recipients = [
    'aura.wear.lb26@gmail.com',
    process.env.MINIYO_ADMIN_EMAIL,
    process.env.MINIYO_ORDER_ALERT_EMAILS,
  ]
    .filter(Boolean)
    .flatMap((v) => String(v).split(','))
    .map((e) => e.trim())
    .filter(Boolean);
  const seenR = new Set();
  const adminEmail = recipients
    .filter((e) => {
      const k = e.toLowerCase();
      if (PLACEHOLDER_RECIPIENTS.has(k)) return false;
      if (seenR.has(k)) return false;
      seenR.add(k);
      return true;
    })
    .join(', ');
  const already = queryRecords('EmailLog', {
    query: { email_type: 'order_notification', order_id, status: 'sent' }, sort: 'sent_at', limit: 1,
  });
  if (already.length > 0) return { status: 'already_sent', message: 'Admin notification already sent for this order' };

  const items = queryRecords('OrderItem', { query: { order_id } });
  const itemsHtml = items.map((it) =>
    `<tr><td>${it.product_name} ${[it.size, it.color].filter(Boolean).join(' / ')}</td><td>×${it.quantity}</td><td>$${Number(it.line_total_usd || 0).toFixed(2)}</td></tr>`
  ).join('');
  const giftHtml = order.is_gift
    ? `<p><strong>🎁 GIFT ORDER</strong>${order.gift_wrapping ? ' · wrapping requested' : ''}${order.hide_invoice_price ? ' · hide prices on slip' : ''}</p>
       ${order.gift_message ? `<p>Gift message: "${escapeHtml(order.gift_message)}"</p>` : ''}`
    : '';
  const html = `<!DOCTYPE html><html><body><h2>New Order: ${order.order_number}</h2>
    ${giftHtml}
    <p>Customer: ${escapeHtml(order.customer_name || '')} · ${escapeHtml(order.customer_phone || '')}<br/>
    Email: ${escapeHtml(order.customer_email || '')}<br/>
    Address: ${escapeHtml([order.building, order.street, order.district, order.city].filter(Boolean).join(', '))}</p>
    <table border="1" cellpadding="6"><tbody>${itemsHtml}</tbody></table>
    <p>Delivery: $${Number(order.delivery_fee_usd || 0).toFixed(2)}<br/>
    <strong>Total: $${Number(order.grand_total_usd || 0).toFixed(2)}</strong><br/>
    Payment: ${order.payment_method}</p></body></html>`;

  const result = await sendEmail({
    to: adminEmail, subject: `New Order ${order.order_number}`, html,
    email_type: 'order_notification', order_id, trigger_event: 'order_created',
  });
  return { status: result.status, log_id: result.log_id };
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const STATUS_TEMPLATES = {
  Confirmed: { subject: 'Order Confirmed', message: "Your order has been confirmed and we're preparing it for shipment." },
  Packed: { subject: 'Order Packed', message: 'Your order has been packed and is ready to ship.' },
  'Out for Delivery': { subject: 'Out for Delivery', message: 'Your order is on its way to you.' },
  Delivered: { subject: 'Order Delivered', message: 'Your order has been delivered. We hope you enjoy!' },
  Cancelled: { subject: 'Order Cancelled', message: 'Your order has been cancelled. If you have any questions, please contact us.' },
};

async function sendOrderStatusUpdate(body) {
  const { order_id, new_status } = body;
  if (!order_id || !new_status) return { _status: 400, error: 'order_id and new_status required' };
  if (!STATUS_TEMPLATES[new_status]) return { _status: 400, error: 'Invalid status' };
  const order = getRecord('Order', order_id);
  if (!order) return { _status: 404, error: 'Order not found' };

  const trigger = `status_changed_to_${new_status}`;
  const already = queryRecords('EmailLog', {
    query: { email_type: 'order_status_update', order_id, status: 'sent', trigger_event: trigger }, sort: 'sent_at', limit: 1,
  });
  if (already.length > 0) return { status: 'already_sent', message: `${new_status} email already sent` };

  const orderTotal = `$${Number(order.grand_total_usd || 0).toFixed(2)}`;

  // Confirmed: send a richer branded confirmation with the full item table.
  if (new_status === 'Confirmed') {
    const items = queryRecords('OrderItem', { query: { order_id } });
    const orderDate = formatOrderDate(order.order_date || order.created_date);
    const subject = `Your order #${order.order_number} is confirmed`;
    const heading = `<h2 style="margin:0 0 14px;font-size:20px;font-weight:600;color:#111111;letter-spacing:.3px;">Your order is confirmed.</h2>`;
    const bodyHtml = `<p style="margin:0 0 16px;color:#444;">Good news ${escapeHtml(firstName(order.customer_name))} — your order is confirmed and we're preparing it.</p>
      <p style="margin:0 0 16px;color:#444;">Order <strong>#${escapeHtml(order.order_number)}</strong><br/>
      Date: ${escapeHtml(orderDate)}<br/>
      Total: <strong>${orderTotal}</strong></p>
      ${orderItemsTableHtml(items)}
      ${btn(`${STORE_BASE_URL}/account/orders/${order_id}`, 'View your order')}`;
    const result = await sendEmail({
      to: order.customer_email,
      subject,
      html: emailShell(heading, bodyHtml),
      email_type: 'order_status_update',
      order_id,
      customer_id: order.customer_id || '',
      trigger_event: trigger,
    });
    return { status: result.status, log_id: result.log_id };
  }

  // All other statuses: branded-shell status note.
  const tpl = STATUS_TEMPLATES[new_status];
  const heading = `<h2 style="margin:0 0 14px;font-size:20px;font-weight:600;color:#111111;letter-spacing:.3px;">${escapeHtml(tpl.subject)}</h2>`;
  const bodyHtml = `<p style="margin:0 0 16px;color:#444;">${escapeHtml(tpl.message)}</p>
    <p style="margin:0 0 16px;color:#444;">Order <strong>#${escapeHtml(order.order_number)}</strong><br/>
    Status: ${escapeHtml(new_status)}<br/>
    Total: <strong>${orderTotal}</strong></p>
    ${btn(`${STORE_BASE_URL}/account/orders/${order_id}`, 'View your order')}`;

  const result = await sendEmail({
    to: order.customer_email,
    subject: tpl.subject,
    html: emailShell(heading, bodyHtml),
    email_type: 'order_status_update',
    order_id,
    customer_id: order.customer_id || '',
    trigger_event: trigger,
  });
  return { status: result.status, log_id: result.log_id };
}

async function sendWelcomeEmailNew(body) {
  const { customer_id, email, name, full_name } = body;
  if (!customer_id || !email) return { _status: 400, error: 'customer_id and email required' };
  const already = queryRecords('EmailLog', {
    query: { email_type: 'welcome', customer_id, status: 'sent' }, sort: 'sent_at', limit: 1,
  });
  if (already.length > 0) return { status: 'already_sent', message: 'Welcome email already sent' };

  const localPart = String(email).split('@')[0] || 'there';
  // Ignore a name that's actually just the email (Register.jsx passes name: email).
  const realName = [full_name, name].find((n) => n && !String(n).includes('@'));
  const fname = firstName(realName, localPart);
  const subject = `Welcome to AURA WEAR, ${fname}`;
  const heading = `<h2 style="margin:0 0 14px;font-size:20px;font-weight:600;color:#111111;letter-spacing:.3px;">Welcome, ${escapeHtml(fname)}.</h2>`;
  const bodyHtml = `<p style="margin:0 0 16px;color:#444;">Thanks for creating your AURA WEAR account — you're now a Bronze member.</p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#444;line-height:1.8;">
      <li>2 free deliveries on your first orders</li>
      <li>5% off all purchases</li>
      <li>Automatic upgrades to Silver &amp; Gold tiers as you shop</li>
    </ul>
    ${btn(`${STORE_BASE_URL}/account`, 'Go to your account')}`;
  const result = await sendEmail({
    to: email,
    subject,
    html: emailShell(heading, bodyHtml),
    email_type: 'welcome',
    customer_id,
    trigger_event: 'user.registered',
  });
  return { status: result.status, log_id: result.log_id };
}

// ─── Order delivered handler ────────────────────────────────────────────────
// On delivery: ensure stock is committed, recompute the customer's lifetime
// spend / tier, and notify the customer. Idempotent via order.delivered_processed.
async function onOrderDelivered(body, user) {
  const { order_id } = body;
  if (!order_id) return { _status: 400, error: 'order_id required' };
  const order = getRecord('Order', order_id);
  if (!order) return { _status: 404, error: 'Order not found' };
  if (order.delivered_processed) {
    return { ok: true, message: 'Order already processed for delivery' };
  }

  // Commit stock if it was never committed (e.g. order jumped straight to Delivered).
  let stock_result = { ok: true, message: 'Stock already committed' };
  if (!order.stock_committed) {
    stock_result = commitStock({ order_id }, user || { email: 'system' });
  }

  // Recompute membership tier from lifetime spend.
  let tier_result = { upgraded: false };
  if (order.customer_id) {
    tier_result = membershipEngine({ action: 'check_tier_upgrade', customer_id: order.customer_id });
  }

  updateRecord('Order', order_id, {
    order_status: 'Delivered',
    delivered_processed: true,
    delivered_at: nowIso(),
  });

  // Customer-facing delivered email (best effort).
  let email_result = { status: 'skipped' };
  try {
    email_result = await sendOrderStatusUpdate({ order_id, new_status: 'Delivered' });
  } catch (e) {
    email_result = { status: 'failed', error: e?.message };
  }

  return { ok: true, stock: stock_result, tier: tier_result, email: email_result };
}

// ─── RBAC: role hierarchy + user administration ─────────────────────────────
// super_admin > admin > staff > customer. Higher rank inherits lower powers.
const ROLE_RANK = { customer: 0, staff: 1, admin: 2, super_admin: 3 };
const VALID_ROLES = ['customer', 'staff', 'admin', 'super_admin'];
function rankOf(role) { return ROLE_RANK[role] ?? -1; }

function stripUser(u) {
  if (!u) return u;
  const { password_hash, otp_hash, ...rest } = u;
  return rest;
}

// Super-admin-only: list all team/staff accounts (credentials stripped).
async function listUsers(body, actor) {
  const all = queryRecords('User', { sort: '-created_date', limit: 1000 });
  return { users: all.map(stripUser) };
}

// Super-admin-only: change a user's role. Server-side guard is the source of
// truth — the UI gating is only cosmetic. Refuses to demote the last super
// admin and refuses self-demotion, and records an AuditLog entry.
async function setUserRole(body, actor) {
  const { user_id, role } = body || {};
  if (!user_id || !role) return { _status: 400, error: 'user_id and role are required' };
  if (!VALID_ROLES.includes(role)) return { _status: 400, error: `Invalid role: ${role}` };

  const target = getRecord('User', user_id);
  if (!target) return { _status: 404, error: 'User not found' };

  if (actor && target.id === actor.id) {
    return { _status: 400, error: 'You cannot change your own role.' };
  }

  // Never let the last super admin be demoted — that would lock everyone out.
  if (target.role === 'super_admin' && role !== 'super_admin') {
    const superAdmins = queryRecords('User', { query: { role: 'super_admin' } });
    if (superAdmins.length <= 1) {
      return { _status: 400, error: 'Cannot demote the last super admin.' };
    }
  }

  const prevRole = target.role;
  const updated = updateRecord('User', user_id, { role });

  try {
    createRecord('AuditLog', {
      action: 'role_changed',
      entity: 'User',
      entity_id: user_id,
      user_name: actor?.full_name || actor?.email || 'system',
      details: `${target.email}: ${prevRole} → ${role}`,
      created_at: nowIso(),
    });
  } catch { /* audit is best-effort */ }

  return { ok: true, user: stripUser(updated) };
}

// ─── Guest checkout: find-or-create customer ────────────────────────────────
// Public, server-trusted replacement for the storefront's old anonymous
// `Customer.filter({email})` existence check (removed when generic Customer
// reads were auth-gated). Idempotent: matches an existing Customer by
// normalized (trimmed, lowercased) email and reuses it; otherwise creates one
// and seeds Bronze membership + a welcome email. Re-running for the same email
// always yields exactly one Customer.
//
// Account-enumeration safe: the response is identical — `{ ok: true,
// customer_id }` — whether the email pre-existed or was just created, so an
// anonymous caller cannot tell registered emails apart from new ones. It never
// returns any other Customer PII.
async function upsertCustomerForOrder(body) {
  const email = String(body?.email || '').trim().toLowerCase();
  if (!email) return { _status: 400, error: 'email required' };
  const name = body?.name != null ? String(body.name).slice(0, 200) : '';
  const phone = body?.phone != null ? String(body.phone).slice(0, 60) : '';

  // Case-insensitive match across stored emails (older records may be mixed case).
  const existing = queryRecords('Customer', { sort: 'created_date', limit: 100000 })
    .find((c) => String(c.email || '').trim().toLowerCase() === email);

  if (existing) {
    // Backfill only missing contact fields; never overwrite what the customer
    // already has on file.
    const patch = {};
    if (name && !existing.name) patch.name = name;
    if (phone && !existing.phone) patch.phone = phone;
    if (Object.keys(patch).length > 0) updateRecord('Customer', existing.id, patch);
    return { ok: true, customer_id: existing.id };
  }

  const created = createRecord('Customer', {
    email,
    name,
    phone,
    current_tier: 'Bronze',
    lifetime_spend_usd: 0,
    free_delivery_credits_remaining: 0,
  });

  // Seed Bronze credits + welcome email (best-effort, never blocks checkout).
  try { membershipEngine({ action: 'grant_bronze_credits', customer_id: created.id }); }
  catch { /* non-blocking */ }
  try { await sendWelcomeEmailNew({ customer_id: created.id, email, name }); }
  catch { /* non-blocking */ }

  return { ok: true, customer_id: created.id };
}

// Server-side Meta Conversions API Purchase. Authoritative + idempotent: fires
// at most once per order (guarded by a flag on the order doc) and reuses the
// browser event_id so Meta deduplicates the browser + server events. Silent
// no-op when the CAPI env vars are unset, so checkout is never affected.
async function metaTrackPurchase({ order_id, event_id, event_source_url } = {}) {
  if (!order_id) { const e = new Error('order_id required'); e.status = 400; throw e; }
  const order = getRecord('Order', order_id);
  if (!order) { const e = new Error('Order not found'); e.status = 404; throw e; }
  if (order.meta_capi_purchase_sent) return { ok: true, deduped: true };
  if (!isCapiConfigured()) return { ok: true, skipped: 'not_configured' };

  const items = queryRecords('OrderItem', { query: { order_id } });
  const result = await sendPurchaseCapi(order, items, {
    eventId: event_id || order_id,
    eventSourceUrl: event_source_url,
  });
  if (result.sent) {
    updateRecord('Order', order_id, {
      meta_capi_purchase_sent: true,
      meta_capi_event_id: event_id || order_id,
    });
  }
  return { ok: !!result.sent, ...result };
}

const REGISTRY = {
  inventoryEngine,
  membershipEngine,
  metaTrackPurchase,
  upsertCustomerForOrder,
  seedShippingZones,
  sendOrderConfirmation,
  sendOrderNotification,
  sendOrderStatusUpdate,
  sendWelcomeEmailNew,
  onOrderDelivered,
  listUsers,
  setUserRole,
  ...ADMIN_TOOLS,
};

// Minimum role required to invoke each function.
//   'public' — storefront/guest flows (checkout, registration).
//   role name — that role or higher (by ROLE_RANK).
// Anything NOT listed defaults to 'admin' (fail-safe: never expose a new
// function to guests by forgetting to add it here).
const FUNCTION_GUARDS = {
  inventoryEngine: 'public',
  membershipEngine: 'public',
  metaTrackPurchase: 'public',
  upsertCustomerForOrder: 'public',
  sendWelcomeEmailNew: 'public',
  sendOrderConfirmation: 'public',
  sendOrderNotification: 'public',
  sendOrderStatusUpdate: 'staff',
  onOrderDelivered: 'staff',
  seedShippingZones: 'admin',
  listUsers: 'super_admin',
  setUserRole: 'super_admin',
  ...ADMIN_TOOL_GUARDS,
};

function authorizeFunction(name, user) {
  const required = FUNCTION_GUARDS[name] ?? 'admin'; // fail-safe default
  if (required === 'public') return;
  if (!user) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }
  if (rankOf(user.role) < rankOf(required)) {
    const err = new Error('Forbidden: insufficient permissions');
    err.status = 403;
    throw err;
  }
}

// Exported for unit tests (reservation lifecycle).
export { checkStock, reserveStock, commitStock, releaseStock };

export async function invokeFunction(name, body, user) {
  const fn = REGISTRY[name];
  if (!fn) {
    const err = new Error(`Unknown function: ${name}`);
    err.status = 404;
    throw err;
  }
  authorizeFunction(name, user);
  return await fn(body || {}, user);
}
