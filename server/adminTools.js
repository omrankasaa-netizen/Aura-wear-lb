// Admin tooling ported from MiniYo: category cleanup (B), dashboard snapshot
// with server-side money lockdown (G), projected-revenue financials (H), and
// customer management + CSV exports (I). All money-bearing output is shaped by
// role here on the server — a non-super-admin browser never receives it.
import {
  queryRecords, getRecord, createRecord, updateRecord, deleteRecord,
  kvGet, kvSet, nowIso, getWriteVersion,
} from './db.js';

const ROLE_RANK = { customer: 0, staff: 1, admin: 2, super_admin: 3 };
function isSuper(user) { return (ROLE_RANK[user?.role] ?? -1) >= ROLE_RANK.super_admin; }

function writeAudit(action, entity, entityId, actor, details) {
  try {
    createRecord('AuditLog', {
      action, entity, entity_id: entityId || '',
      user_name: actor?.full_name || actor?.email || 'system',
      details: details || '', created_at: nowIso(),
    });
  } catch { /* audit is best-effort */ }
}

// ─── B. Category cleanup ────────────────────────────────────────────────────
// Normalize a display name to a comparison key: trim, collapse whitespace,
// lowercase, strip punctuation. "Kids' Sets " and "kids sets" collapse to one.
function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stockOf(p, variantsByProduct) {
  if (p.has_variants) {
    const pvs = variantsByProduct[p.id] || [];
    return pvs.reduce((s, v) => s + (Number(v.qty_on_hand) || 0), 0);
  }
  return Number(p.stock_quantity) || 0;
}

// Detects duplicate categories (same normalized name or slug, within the same
// parent) and collapses each group onto one canonical survivor:
//   canonical = has-icon → most-products → oldest.
// Product category_id / subcategory_id are remapped to the survivor, the
// survivor inherits the icon + Arabic name if missing, and the losers are
// removed. Dry-run by default; pass { apply: true } to commit. Optional
// { merges: [{ from, to }] } forces specific merges first.
async function cleanupCategories(body, user) {
  const apply = body?.apply === true;
  const forcedMerges = Array.isArray(body?.merges) ? body.merges : [];

  const categories = queryRecords('Category', { limit: 5000 });
  const products = queryRecords('Product', { limit: 10000 });

  const productCount = {};
  for (const p of products) {
    if (p.category_id) productCount[p.category_id] = (productCount[p.category_id] || 0) + 1;
    if (p.subcategory_id) productCount[p.subcategory_id] = (productCount[p.subcategory_id] || 0) + 1;
  }

  const byId = {};
  for (const c of categories) byId[c.id] = c;

  // Build duplicate groups keyed by (parent_id, normalized name/slug).
  const groups = {};
  for (const c of categories) {
    const key = `${c.parent_id || ''}::${normalizeKey(c.name) || normalizeKey(c.slug)}`;
    (groups[key] ||= []).push(c);
  }

  function pickCanonical(list) {
    return [...list].sort((a, b) => {
      const ai = a.image_url ? 1 : 0, bi = b.image_url ? 1 : 0;
      if (ai !== bi) return bi - ai;                       // has-icon first
      const ac = productCount[a.id] || 0, bc = productCount[b.id] || 0;
      if (ac !== bc) return bc - ac;                       // most-products
      return String(a.created_date).localeCompare(String(b.created_date)); // oldest
    })[0];
  }

  // Map of loser id → survivor id, plus a human-readable plan.
  const remap = {};
  const plan = [];

  // 1) honor explicit forced merges
  for (const m of forcedMerges) {
    if (m?.from && m?.to && byId[m.from] && byId[m.to] && m.from !== m.to) {
      remap[m.from] = m.to;
      plan.push({ type: 'forced', survivor: byId[m.to].name, removed: byId[m.from].name, survivorId: m.to, removedId: m.from });
    }
  }

  // 2) automatic duplicate detection
  for (const list of Object.values(groups)) {
    if (list.length < 2) continue;
    const survivor = pickCanonical(list);
    for (const c of list) {
      if (c.id === survivor.id || remap[c.id]) continue;
      remap[c.id] = survivor.id;
      plan.push({
        type: 'duplicate', survivor: survivor.name, removed: c.name,
        survivorId: survivor.id, removedId: c.id,
        removedProducts: productCount[c.id] || 0,
      });
    }
  }

  // Follow chains so a→b→c resolves to the final survivor.
  function resolve(id) {
    const seen = new Set();
    let cur = id;
    while (remap[cur] && !seen.has(cur)) { seen.add(cur); cur = remap[cur]; }
    return cur;
  }

  let remappedProducts = 0;
  const inheritPlan = [];
  if (apply) {
    // Remap product links.
    for (const p of products) {
      const patch = {};
      if (p.category_id && remap[p.category_id]) patch.category_id = resolve(p.category_id);
      if (p.subcategory_id && remap[p.subcategory_id]) patch.subcategory_id = resolve(p.subcategory_id);
      if (Object.keys(patch).length) { updateRecord('Product', p.id, patch); remappedProducts++; }
    }
    // Survivor inherits icon + Arabic name from a loser when missing.
    for (const loserId of Object.keys(remap)) {
      const survivorId = resolve(loserId);
      const survivor = getRecord('Category', survivorId);
      const loser = byId[loserId];
      if (!survivor || !loser) continue;
      const patch = {};
      if (!survivor.image_url && loser.image_url) patch.image_url = loser.image_url;
      if (!survivor.name_ar && loser.name_ar) patch.name_ar = loser.name_ar;
      if (Object.keys(patch).length) { updateRecord('Category', survivorId, patch); inheritPlan.push({ id: survivorId, ...patch }); }
    }
    // Delete losers.
    for (const loserId of Object.keys(remap)) deleteRecord('Category', loserId);
    writeAudit('categories_cleanup', 'Category', '', user,
      `merged ${Object.keys(remap).length} duplicate categories, remapped ${remappedProducts} products`);
  }

  return {
    ok: true,
    applied: apply,
    duplicateCount: Object.keys(remap).length,
    plan,
    remappedProducts: apply ? remappedProducts : undefined,
    inherited: apply ? inheritPlan : undefined,
    message: apply
      ? `Merged ${Object.keys(remap).length} duplicate categories.`
      : `${Object.keys(remap).length} duplicate categories found. Review and apply to merge.`,
  };
}

// ─── G. Dashboard snapshot (cached + money-locked) ──────────────────────────
let _dashCache = { at: 0, version: -1, snapshot: null };
const DASH_TTL_MS = 45 * 1000;

const REVENUE_STATUSES = ['Confirmed', 'Packed', 'Out for Delivery', 'Delivered'];

function buildDashboardSnapshot() {
  const orders = queryRecords('Order', { limit: 5000 });
  const products = queryRecords('Product', { limit: 10000 });
  const variants = queryRecords('ProductVariant', { limit: 20000 });
  const categories = queryRecords('Category', { limit: 5000 });
  const customers = queryRecords('Customer', { limit: 20000 });

  const variantsByProduct = {};
  for (const v of variants) (variantsByProduct[v.product_id] ||= []).push(v);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayMs = 24 * 60 * 60 * 1000;
  const since = (d) => new Date(now.getTime() - d * dayMs);

  const orderDate = (o) => new Date(o.order_date || o.created_date);
  const isRevenue = (o) => REVENUE_STATUSES.includes(o.order_status);
  const totalOf = (o) => Number(o.grand_total_usd) || 0;

  const ordersToday = orders.filter(o => orderDate(o) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const orders7d = orders.filter(o => orderDate(o) >= since(7));
  const orders30d = orders.filter(o => orderDate(o) >= since(30));
  const prev7d = orders.filter(o => orderDate(o) >= since(14) && orderDate(o) < since(7));
  const ordersThisMonth = orders.filter(o => orderDate(o) >= monthStart);

  const openStatuses = ['New', 'Confirmed', 'Packed', 'Out for Delivery'];
  const byStatus = {};
  for (const o of orders) byStatus[o.order_status] = (byStatus[o.order_status] || 0) + 1;

  // Inventory rollups
  let itemsInStock = 0, lowStockCount = 0, outOfStockCount = 0;
  const lowStockList = [];
  for (const p of products) {
    const pvs = variantsByProduct[p.id] || [];
    const reorder = p.reorder_level || 3;
    let qty;
    if (p.has_variants && pvs.length > 0) qty = pvs.reduce((s, v) => s + (Number(v.qty_on_hand) || 0), 0);
    else qty = Number(p.stock_quantity) || 0;
    itemsInStock += qty;
    if (qty <= 0) outOfStockCount++;
    else if (qty <= reorder) lowStockCount++;
    if (qty <= reorder) lowStockList.push({ id: p.id, name: p.name, sku: p.sku, qty, reorder });
  }
  lowStockList.sort((a, b) => a.qty - b.qty);

  // Money (only surfaced to super admins via shapeDashboard)
  const revWindow = (list) => list.filter(isRevenue).reduce((s, o) => s + totalOf(o), 0);
  const revenueThisMonth = revWindow(ordersThisMonth);
  const revenue7d = revWindow(orders7d);
  const revenue30d = revWindow(orders30d);
  const revenuePrev7d = revWindow(prev7d);
  const paidThisMonth = ordersThisMonth.filter(isRevenue).length;
  const aov = paidThisMonth > 0 ? revenueThisMonth / paidThisMonth : 0;

  // 7-day revenue + order sparkline
  const spark = { orders: [], revenue: [] };
  for (let i = 6; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const end = new Date(start.getTime() + dayMs);
    const dayOrders = orders.filter(o => orderDate(o) >= start && orderDate(o) < end);
    spark.orders.push(dayOrders.length);
    spark.revenue.push(parseFloat(revWindow(dayOrders).toFixed(2)));
  }

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, 10)
    .map(o => ({
      id: o.id, order_number: o.order_number, customer_name: o.customer_name,
      order_status: o.order_status, grand_total_usd: totalOf(o),
    }));

  const topSellers = [...products]
    .map(p => ({ id: p.id, name: p.name, sold: Number(p.units_sold) || 0 }))
    .filter(p => p.sold > 0)
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 5);

  return {
    counts: {
      totalProducts: products.length,
      activeProducts: products.filter(p => p.status === 'Active').length,
      activeCategories: categories.filter(c => c.is_active !== false).length,
      totalCustomers: customers.length,
      itemsInStock, lowStockCount, outOfStockCount,
      ordersToday: ordersToday.length,
      orders7d: orders7d.length,
      orders30d: orders30d.length,
      ordersThisMonth: ordersThisMonth.length,
      openOrders: orders.filter(o => openStatuses.includes(o.order_status)).length,
    },
    trend: { orders7d: orders7d.length, ordersPrev7d: prev7d.length },
    byStatus,
    lowStockList: lowStockList.slice(0, 8),
    recentOrders,
    topSellers,
    spark,
    money: {
      revenueThisMonth, revenue7d, revenue30d, revenuePrev7d, aov,
    },
  };
}

function shapeDashboard(snapshot, user) {
  const show_money = isSuper(user);
  if (show_money) return { ...snapshot, show_money };
  // Strip every monetary field for non-super-admins.
  const { money, ...rest } = snapshot;
  return {
    ...rest,
    show_money,
    spark: { orders: snapshot.spark.orders }, // drop revenue series
    recentOrders: snapshot.recentOrders.map(({ grand_total_usd, ...o }) => o),
  };
}

async function getDashboard(body, user) {
  const version = getWriteVersion();
  const fresh = Date.now() - _dashCache.at < DASH_TTL_MS && _dashCache.version === version;
  if (!fresh || !_dashCache.snapshot) {
    _dashCache = { at: Date.now(), version, snapshot: buildDashboardSnapshot() };
  }
  return shapeDashboard(_dashCache.snapshot, user);
}

// ─── H. Projected-revenue financials (super-admin only) ─────────────────────
const FIN_CONFIG_KEY = 'financials_config';
const DEFAULT_OVERHEADS = [
  { label: 'Printing (cards, stickers, labels)', qty: 1, unit_price: 0 },
  { label: 'Shopping bags', qty: 1, unit_price: 0 },
  { label: 'Packaging (boxes, mailers)', qty: 1, unit_price: 0 },
  { label: 'Tape / fillers', qty: 1, unit_price: 0 },
  { label: 'Marketing / Ads', qty: 1, unit_price: 0 },
  { label: 'Delivery overhead', qty: 1, unit_price: 0 },
  { label: 'Platform / Hosting', qty: 1, unit_price: 0 },
  { label: 'Other', qty: 1, unit_price: 0 },
];
const DEFAULT_COST_RATIO = 0.6;

function readFinConfig() {
  const raw = kvGet(FIN_CONFIG_KEY);
  if (!raw) return { default_cost_ratio: DEFAULT_COST_RATIO, overheads: DEFAULT_OVERHEADS, currency_label: 'USD' };
  try {
    const parsed = JSON.parse(raw);
    return {
      default_cost_ratio: Number(parsed.default_cost_ratio) || DEFAULT_COST_RATIO,
      overheads: Array.isArray(parsed.overheads) ? parsed.overheads : DEFAULT_OVERHEADS,
      currency_label: parsed.currency_label || 'USD',
    };
  } catch {
    return { default_cost_ratio: DEFAULT_COST_RATIO, overheads: DEFAULT_OVERHEADS, currency_label: 'USD' };
  }
}

async function getFinancialsConfig() {
  return { config: readFinConfig() };
}

async function saveFinancialsConfig(body, user) {
  const cfg = {
    default_cost_ratio: Number(body?.default_cost_ratio) || DEFAULT_COST_RATIO,
    currency_label: body?.currency_label || 'USD',
    overheads: Array.isArray(body?.overheads)
      ? body.overheads.map(r => ({
          label: String(r.label || '').slice(0, 120),
          qty: Number(r.qty) || 0,
          unit_price: Number(r.unit_price) || 0,
        }))
      : DEFAULT_OVERHEADS,
  };
  kvSet(FIN_CONFIG_KEY, JSON.stringify(cfg));
  writeAudit('financials_config_saved', 'SiteSetting', FIN_CONFIG_KEY, user, '');
  return { ok: true, config: cfg };
}

async function getFinancials(body, user) {
  const config = readFinConfig();
  const products = queryRecords('Product', { limit: 10000 });
  const variants = queryRecords('ProductVariant', { limit: 20000 });
  const variantsByProduct = {};
  for (const v of variants) (variantsByProduct[v.product_id] ||= []).push(v);

  let potentialRevenue = 0, cogs = 0, activeCount = 0, unitsInStock = 0;
  for (const p of products) {
    if (p.status && p.status !== 'Active') continue;
    activeCount++;
    const stock = stockOf(p, variantsByProduct);
    unitsInStock += stock;
    const price = Number(p.price_usd) || 0;
    const cost = (Number(p.cost_usd) > 0 ? Number(p.cost_usd)
      : (Number(p.cost) > 0 ? Number(p.cost) : price * config.default_cost_ratio));
    potentialRevenue += price * stock;
    cogs += cost * stock;
  }

  const grossProfit = potentialRevenue - cogs;
  const grossMargin = potentialRevenue > 0 ? grossProfit / potentialRevenue : 0;
  const totalOverheads = (config.overheads || []).reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unit_price) || 0), 0);
  const netProjectedProfit = grossProfit - totalOverheads;
  const netMargin = potentialRevenue > 0 ? netProjectedProfit / potentialRevenue : 0;

  return {
    config,
    activeProducts: activeCount,
    unitsInStock,
    potentialRevenue: round2(potentialRevenue),
    cogs: round2(cogs),
    grossProfit: round2(grossProfit),
    grossMargin: round4(grossMargin),
    totalOverheads: round2(totalOverheads),
    netProjectedProfit: round2(netProjectedProfit),
    netMargin: round4(netMargin),
  };
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function round4(n) { return Math.round((n + Number.EPSILON) * 10000) / 10000; }

// ─── I. Customers + exports ─────────────────────────────────────────────────
function ordersForCustomer(customer, allOrders) {
  const email = (customer.email || '').toLowerCase();
  return allOrders.filter(o =>
    (customer.id && (o.customer_id === customer.id)) ||
    (email && (o.customer_email || '').toLowerCase() === email)
  );
}

function enrichCustomer(c, allOrders, show_money) {
  const co = ordersForCustomer(c, allOrders);
  const paid = co.filter(o => REVENUE_STATUSES.includes(o.order_status));
  const totalSpent = paid.reduce((s, o) => s + (Number(o.grand_total_usd) || 0), 0);
  const lastOrder = co.map(o => o.order_date || o.created_date).sort().reverse()[0] || null;
  const base = {
    id: c.id, name: c.name || '', email: c.email || '', phone: c.phone || '',
    city: c.city || c.location || '', is_guest: !c.user_id && !c.account_id,
    tags: Array.isArray(c.tags) ? c.tags : [],
    notes: c.notes || '', is_blocked: !!c.is_blocked, block_reason: c.block_reason || '',
    tier: c.current_tier || c.membership_tier || 'Bronze',
    total_orders: co.length,
    created_date: c.created_date,
    last_order_date: lastOrder,
  };
  if (show_money) {
    base.total_spent = round2(totalSpent);
    base.aov = co.length > 0 ? round2(totalSpent / co.length) : 0;
  }
  return base;
}

async function listCustomers(body, user) {
  const show_money = isSuper(user);
  const customers = queryRecords('Customer', { sort: '-created_date', limit: 20000 });
  const orders = queryRecords('Order', { limit: 20000 });
  return {
    show_money,
    customers: customers.map(c => enrichCustomer(c, orders, show_money)),
  };
}

async function getCustomerDetail(body, user) {
  const show_money = isSuper(user);
  const { customer_id } = body || {};
  const c = getRecord('Customer', customer_id);
  if (!c) return { _status: 404, error: 'Customer not found' };
  const orders = queryRecords('Order', { limit: 20000 });
  const co = ordersForCustomer(c, orders).sort((a, b) =>
    new Date(b.order_date || b.created_date) - new Date(a.order_date || a.created_date));
  const history = co.map(o => {
    const row = {
      id: o.id, order_number: o.order_number, order_status: o.order_status,
      order_date: o.order_date || o.created_date,
    };
    if (show_money) row.grand_total_usd = round2(Number(o.grand_total_usd) || 0);
    return row;
  });
  return { show_money, customer: enrichCustomer(c, orders, show_money), orders: history };
}

async function setCustomerTags(body, user) {
  const { customer_id, tags } = body || {};
  if (!customer_id) return { _status: 400, error: 'customer_id required' };
  const clean = Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean).slice(0, 30) : [];
  const updated = updateRecord('Customer', customer_id, { tags: clean });
  writeAudit('customer_tags_set', 'Customer', customer_id, user, clean.join(', '));
  return { ok: true, customer: { id: updated.id, tags: clean } };
}

async function setCustomerNotes(body, user) {
  const { customer_id, notes } = body || {};
  if (!customer_id) return { _status: 400, error: 'customer_id required' };
  const clean = String(notes || '').slice(0, 4000);
  updateRecord('Customer', customer_id, { notes: clean });
  writeAudit('customer_notes_set', 'Customer', customer_id, user, '');
  return { ok: true };
}

async function setCustomerBlock(body, user) {
  const { customer_id, is_blocked, block_reason } = body || {};
  if (!customer_id) return { _status: 400, error: 'customer_id required' };
  const patch = { is_blocked: !!is_blocked, block_reason: is_blocked ? String(block_reason || '').slice(0, 500) : '' };
  updateRecord('Customer', customer_id, patch);
  writeAudit(is_blocked ? 'customer_blocked' : 'customer_unblocked', 'Customer', customer_id, user, patch.block_reason);
  return { ok: true, ...patch };
}

async function upsertCustomer(body, user) {
  const { customer_id, name, email, phone, city, tags, notes } = body || {};
  const data = {};
  if (name !== undefined) data.name = String(name).slice(0, 200);
  if (email !== undefined) data.email = String(email).toLowerCase().slice(0, 200);
  if (phone !== undefined) data.phone = String(phone).slice(0, 60);
  if (city !== undefined) data.city = String(city).slice(0, 120);
  if (Array.isArray(tags)) data.tags = tags.map(t => String(t).trim()).filter(Boolean).slice(0, 30);
  if (notes !== undefined) data.notes = String(notes).slice(0, 4000);
  if (customer_id) {
    const updated = updateRecord('Customer', customer_id, data);
    writeAudit('customer_updated', 'Customer', customer_id, user, '');
    return { ok: true, customer: { id: updated.id } };
  }
  const created = createRecord('Customer', data);
  writeAudit('customer_created', 'Customer', created.id, user, data.email || '');
  return { ok: true, customer: { id: created.id } };
}

// CSV helpers — server builds the text, client downloads via Blob.
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  return lines.join('\n');
}

async function exportProductsCsv(body, user) {
  const show_money = isSuper(user);
  const products = queryRecords('Product', { sort: 'name', limit: 10000 });
  const variants = queryRecords('ProductVariant', { limit: 20000 });
  const categories = queryRecords('Category', { limit: 5000 });
  const catName = {}; for (const c of categories) catName[c.id] = c.name;
  const variantsByProduct = {};
  for (const v of variants) (variantsByProduct[v.product_id] ||= []).push(v);

  // One row PER SIZE/VARIANT so the export shows stock per size per variant.
  // Products without variants emit a single row (Size/Variant blank, product
  // total stock). Stock Value at cost is qty×unit cost.
  const headers = ['Name', 'SKU', 'Category', 'Size', 'Variant', 'Status', 'Price (USD)', 'Stock'];
  if (show_money) headers.push('Cost (USD)', 'Stock Value at Cost (USD)');
  const rows = [];
  for (const p of products) {
    const price = Number(p.price_usd) || 0;
    const cost = Number(p.cost_usd) || 0;
    const cat = catName[p.category_id] || '';
    const status = p.status || '';
    const pvs = variantsByProduct[p.id] || [];
    const emit = (sku, size, variant, qty) => {
      const row = [p.name, sku || '', cat, size || '', variant || '', status, price.toFixed(2), qty];
      if (show_money) row.push(cost.toFixed(2), (cost * qty).toFixed(2));
      rows.push(row);
    };
    if (p.has_variants && pvs.length > 0) {
      for (const v of pvs) emit(v.sku || p.sku, v.size, v.color, Number(v.qty_on_hand) || 0);
    } else {
      emit(p.sku, '', '', Number(p.stock_quantity) || 0);
    }
  }
  return { filename: 'products.csv', csv: toCsv(headers, rows) };
}

async function exportInventoryCsv(body, user) {
  const show_money = isSuper(user);
  const products = queryRecords('Product', { sort: 'name', limit: 10000 });
  const variants = queryRecords('ProductVariant', { limit: 20000 });
  const variantsByProduct = {};
  for (const v of variants) (variantsByProduct[v.product_id] ||= []).push(v);

  const headers = ['Product', 'SKU', 'Variant', 'On Hand', 'Reorder Level'];
  if (show_money) headers.push('Unit Cost (USD)', 'Unit Price (USD)', 'Stock Value at Cost (USD)');
  const rows = [];
  for (const p of products) {
    const reorder = p.reorder_level || 3;
    const cost = Number(p.cost_usd) || 0;
    const price = Number(p.price_usd) || 0;
    const pvs = variantsByProduct[p.id] || [];
    if (p.has_variants && pvs.length > 0) {
      for (const v of pvs) {
        const qty = Number(v.qty_on_hand) || 0;
        const row = [p.name, v.sku || p.sku || '', [v.size, v.color].filter(Boolean).join(' / '), qty, reorder];
        if (show_money) row.push(cost.toFixed(2), price.toFixed(2), (cost * qty).toFixed(2));
        rows.push(row);
      }
    } else {
      const qty = Number(p.stock_quantity) || 0;
      const row = [p.name, p.sku || '', '—', qty, reorder];
      if (show_money) row.push(cost.toFixed(2), price.toFixed(2), (cost * qty).toFixed(2));
      rows.push(row);
    }
  }
  return { filename: 'inventory.csv', csv: toCsv(headers, rows) };
}

async function exportCustomersCsv(body, user) {
  const show_money = isSuper(user);
  const { customers } = await listCustomers(body, user);
  let list = customers;
  if (Array.isArray(body?.ids) && body.ids.length) {
    const set = new Set(body.ids);
    list = customers.filter(c => set.has(c.id));
  }
  const headers = ['Name', 'Email', 'Phone', 'City', 'Tier', 'Orders', 'Last Order', 'Blocked'];
  if (show_money) headers.push('Total Spent (USD)');
  const rows = list.map(c => {
    const row = [c.name, c.email, c.phone, c.city, c.tier, c.total_orders,
      c.last_order_date ? String(c.last_order_date).slice(0, 10) : '', c.is_blocked ? 'Yes' : ''];
    if (show_money) row.push((c.total_spent || 0).toFixed(2));
    return row;
  });
  return { filename: 'customers.csv', csv: toCsv(headers, rows) };
}

async function exportCustomerEmailsCsv(body, user) {
  const { customers } = await listCustomers(body, user);
  let list = customers;
  if (Array.isArray(body?.ids) && body.ids.length) {
    const set = new Set(body.ids);
    list = customers.filter(c => set.has(c.id));
  }
  const rows = list.filter(c => c.email).map(c => [c.name, c.email]);
  return { filename: 'customer-emails.csv', csv: toCsv(['Name', 'Email'], rows) };
}

export const ADMIN_TOOLS = {
  cleanupCategories,
  getDashboard,
  getFinancials,
  getFinancialsConfig,
  saveFinancialsConfig,
  listCustomers,
  getCustomerDetail,
  setCustomerTags,
  setCustomerNotes,
  setCustomerBlock,
  upsertCustomer,
  exportProductsCsv,
  exportInventoryCsv,
  exportCustomersCsv,
  exportCustomerEmailsCsv,
};

// Minimum role per function. Money-bearing reads use 'staff'/'admin' but shape
// their output by role internally; financial config + projected revenue are
// strictly super_admin.
export const ADMIN_TOOL_GUARDS = {
  cleanupCategories: 'admin',
  getDashboard: 'staff',
  getFinancials: 'super_admin',
  getFinancialsConfig: 'super_admin',
  saveFinancialsConfig: 'super_admin',
  listCustomers: 'staff',
  getCustomerDetail: 'staff',
  setCustomerTags: 'admin',
  setCustomerNotes: 'admin',
  setCustomerBlock: 'admin',
  upsertCustomer: 'admin',
  exportProductsCsv: 'admin',
  exportInventoryCsv: 'admin',
  exportCustomersCsv: 'admin',
  exportCustomerEmailsCsv: 'admin',
};

// ─── Generic entity money lockdown ──────────────────────────────────────────
// The generic /api/entities read+write surface is otherwise role-blind, so it
// would hand monetary figures to any non-super-admin reader (a plain admin or
// staff, or even an anonymous storefront client). These maps centralize which
// fields are monetary per entity so the generic endpoints can strip them.
//
// Retail price fields (price_usd, compare_at_price_usd, promo/discount values)
// are intentionally NOT listed: the public storefront must show them. Only
// internal money — order aggregates, line totals, customer spend, product cost,
// purchases, and overheads — is gated.
const MONEY_FIELDS = {
  Order: [
    'subtotal_usd', 'discount_usd', 'delivery_fee_usd', 'grand_total_usd',
    'tax_usd', 'tip_usd', 'refund_usd', 'refunded_usd',
    'amount_paid_usd', 'amount_refunded_usd', 'total_usd',
  ],
  OrderItem: ['unit_price_usd', 'line_total_usd', 'cost_usd', 'discount_usd'],
  Customer: ['total_spent_usd', 'lifetime_spend_usd', 'aov', 'aov_usd'],
  Product: ['cost_usd', 'cost'],
  ProductVariant: ['cost_usd', 'cost'],
  Purchase: ['amount_usd', 'cost_usd', 'unit_cost_usd', 'total_cost_usd', 'grand_total_usd', 'subtotal_usd'],
  Overhead: ['rent_usd', 'utilities_usd', 'marketing_usd', 'other_usd', 'amount_usd', 'amount', 'total_usd'],
};

// Entities whose money may legitimately be seen by the record's owner (a
// customer viewing their OWN order/spend) or via guest self-service lookups.
// Everything else (Product cost, Purchase, Overhead) is strictly super-admin.
const OWNERSHIP_MONEY_ENTITIES = new Set(['Order', 'OrderItem', 'Customer']);

// Internal-only money entities: non-super writes must never set or wipe these
// fields. (Order/OrderItem/Customer are excluded — guest checkout writes their
// money legitimately, and updateRecord merges so untouched fields are kept.)
const WRITE_MONEY_ENTITIES = new Set(['Product', 'ProductVariant', 'Purchase', 'Overhead']);

function stripFields(rec, fields) {
  let copy = null;
  for (const f of fields) {
    if (rec && Object.prototype.hasOwnProperty.call(rec, f)) {
      if (!copy) copy = { ...rec };
      delete copy[f];
    }
  }
  return copy || rec;
}

function ownsOrder(o, user) {
  if (!user || !o) return false;
  const email = (user.email || '').toLowerCase();
  return !!(
    (o.customer_email && String(o.customer_email).toLowerCase() === email) ||
    (o.customer_id && o.customer_id === user.id)
  );
}

function ownsCustomer(c, user) {
  if (!user || !c) return false;
  const email = (user.email || '').toLowerCase();
  return !!(
    (c.user_id && c.user_id === user.id) ||
    (c.account_id && c.account_id === user.id) ||
    (c.email && String(c.email).toLowerCase() === email)
  );
}

// Strip monetary fields from generic entity READ output for non-super-admins.
// `records` may be a single record or an array. `query` is the parsed list
// filter (used to recognize self-service flows: guest order tracking by
// order_number, and own-order line items scoped by order_id).
export function shapeEntityReadsForRole(entity, records, user, query) {
  const fields = MONEY_FIELDS[entity];
  if (!fields) return records;        // entity carries no gated money
  if (isSuper(user)) return records;  // super admins see everything

  const single = !Array.isArray(records);
  const arr = single ? [records] : records;

  const rank = ROLE_RANK[user?.role] ?? -1;
  const canSelfServe = rank < ROLE_RANK.staff; // guest or customer only
  const orderNumberLookup = !!(query && Object.prototype.hasOwnProperty.call(query, 'order_number'));
  const orderIdScoped = !!(query && Object.prototype.hasOwnProperty.call(query, 'order_id'));

  const shaped = arr.map((rec) => {
    if (!rec) return rec;
    if (!OWNERSHIP_MONEY_ENTITIES.has(entity)) return stripFields(rec, fields); // always strip
    let keepMoney = false;
    if (entity === 'Order') {
      keepMoney = ownsOrder(rec, user) || (canSelfServe && orderNumberLookup);
    } else if (entity === 'OrderItem') {
      // Line items are fetched scoped by order_id; allow only for guest/customer
      // self-service (admin-tier readers get them stripped).
      keepMoney = canSelfServe && orderIdScoped;
    } else if (entity === 'Customer') {
      keepMoney = ownsCustomer(rec, user);
    }
    return keepMoney ? rec : stripFields(rec, fields);
  });

  return single ? shaped[0] : shaped;
}

// ─── Generic entity READ authorization (anti-PII-leak) ──────────────────────
// The generic read surface is otherwise unauthenticated, so any anonymous
// client could LIST/GET full Order and Customer records — leaking customer PII
// (name, phone, address, email) and order details. These sets + the authorizer
// below gate the private/admin entities while keeping the public storefront
// catalog open and preserving guest/customer self-service.
//
// Anything NOT listed in either set stays publicly readable (Product, Category,
// CmsSection, Faq, Review, PromoCode, ShippingZone, … — the storefront needs
// these unauthenticated).
const ADMIN_ONLY_READ_ENTITIES = new Set([
  'User', 'EmailLog', 'AuditLog', 'Purchase', 'Overhead',
  'InventoryMovement', 'FreeDeliveryCredit',
]);

// PII/ownership entities: admin-tier sees all; a non-admin may only reach their
// OWN records or use an unguessable self-service token (order_number / order_id).
const PRIVATE_READ_ENTITIES = new Set([
  'Order', 'OrderItem', 'Customer', 'CustomerAddress',
  'OrderStatusHistory', 'MembershipHistory', 'WishlistItem',
]);

function isAdminTier(user) { return (ROLE_RANK[user?.role] ?? -1) >= ROLE_RANK.staff; }
function hasKey(q, k) { return !!(q && Object.prototype.hasOwnProperty.call(q, k)); }
function eqEmail(a, b) { return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase(); }

// Decide whether a generic entity read may proceed.
//   entity  — the entity name
//   user    — resolved requester (or null/undefined when anonymous)
//   query   — parsed list filter ({} for GET-by-id)
//   byId    — true for GET /:entity/:id (ownership re-checked after fetch)
// Returns { allow:true } or { allow:false, status }. status is 401 when the
// caller is anonymous (authenticate to proceed) and 403 when authenticated but
// not permitted.
export function authorizeEntityRead(entity, user, query, byId = false) {
  const deny = () => ({ allow: false, status: user ? 403 : 401 });

  if (ADMIN_ONLY_READ_ENTITIES.has(entity)) {
    return isAdminTier(user) ? { allow: true } : deny();
  }
  if (!PRIVATE_READ_ENTITIES.has(entity)) return { allow: true }; // public catalog
  if (isAdminTier(user)) return { allow: true };                  // admin manage views

  // Non-admin (anonymous or customer) from here on.
  // GET-by-id has no query to scope on: anonymous is denied outright; an
  // authenticated user is allowed through and the handler enforces ownership.
  if (byId) return user ? { allow: true } : { allow: false, status: 401 };

  switch (entity) {
    case 'Order':
      // Guest receipt by order_number, or own orders by email/id.
      if (hasKey(query, 'order_number')) return { allow: true };
      if (user && (eqEmail(query.customer_email, user.email) || query.customer_id === user.id)) {
        return { allow: true };
      }
      return deny();
    case 'OrderItem':
    case 'OrderStatusHistory':
      // Scoped by the parent order's unguessable id (receipt + own history).
      return hasKey(query, 'order_id') ? { allow: true } : deny();
    case 'Customer':
      // Own record only: filter must pin the requester's own identity.
      if (user && (eqEmail(query.email, user.email) || query.user_id === user.id || query.account_id === user.id)) {
        return { allow: true };
      }
      return deny();
    case 'CustomerAddress':
      // Authenticated, scoped to a customer id (address book).
      return user && hasKey(query, 'customer_id') ? { allow: true } : deny();
    case 'MembershipHistory':
    case 'WishlistItem':
      return user ? { allow: true } : deny();
    default:
      return deny();
  }
}

// Ownership check for a single private record fetched by id (GET /:entity/:id).
// Admin-tier always passes; otherwise only the record's owner. Entities with no
// natural per-record owner are admin-only by id.
export function canReadRecordById(entity, record, user) {
  if (isAdminTier(user)) return true;
  if (!record) return true; // let the handler return its own 404
  if (entity === 'Order') return ownsOrder(record, user);
  if (entity === 'Customer') return ownsCustomer(record, user);
  return false;
}

// Strip monetary fields from a generic entity WRITE payload for non-super
// admins, so they cannot set OR (thanks to merge-update) wipe internal money.
export function stripWriteMoneyForRole(entity, body, user) {
  if (isSuper(user)) return body;
  if (!WRITE_MONEY_ENTITIES.has(entity)) return body;
  const fields = MONEY_FIELDS[entity];
  if (!fields || !body) return body;
  return stripFields(body, fields);
}

// Helper reused by the order-create guard in index.js.
export function isCustomerBlocked(orderBody) {
  const email = (orderBody?.customer_email || '').toLowerCase();
  const id = orderBody?.customer_id;
  const customers = queryRecords('Customer', { limit: 20000 });
  const match = customers.find(c =>
    (id && c.id === id) || (email && (c.email || '').toLowerCase() === email));
  return !!(match && match.is_blocked);
}
