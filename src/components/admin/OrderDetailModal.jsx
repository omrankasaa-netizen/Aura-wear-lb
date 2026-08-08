import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Printer, MessageCircle, ChevronRight, Gift, Pencil, Plus, Loader2 } from 'lucide-react';
import { logAction } from '@/lib/auditLog';
import { commitStock, releaseStock, reserveOrderStock, editOrderItems } from '@/lib/inventory';
import { useDiscounts } from '@/contexts/DiscountContext';
import { computeOrderTotals } from '@/lib/orderPricing';
import { toast } from '@/components/ui/use-toast';

const STATUS_FLOW = ['New', 'Confirmed', 'Packed', 'Out for Delivery', 'Delivered'];
const STATUS_COLORS = {
  New: 'bg-blue-50 text-blue-700',
  Confirmed: 'bg-indigo-50 text-indigo-700',
  Packed: 'bg-violet-50 text-violet-700',
  'Out for Delivery': 'bg-amber-50 text-amber-700',
  Delivered: 'bg-green-50 text-green-700',
  Cancelled: 'bg-destructive/10 text-destructive',
};

export default function OrderDetailModal({ order, onClose, onUpdated, currentUser }) {
  const queryClient = useQueryClient();
  const { getDiscountedPrice } = useDiscounts();
  const [updating, setUpdating] = useState(false);
  const [err, setErr] = useState('');

  // ── Edit-items mode ──────────────────────────────────────────────────────
  // Editable while the order is New / Confirmed / Packed. Locked from
  // 'Out for Delivery' on (goods physically moving) and when Cancelled.
  const canEdit = ['New', 'Confirmed', 'Packed'].includes(order.order_status);
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState('');
  const [reserveErr, setReserveErr] = useState('');
  const [editShortages, setEditShortages] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState(null);
  const [addedKey, setAddedKey] = useState(null);
  const [editDelivery, setEditDelivery] = useState('0');
  const [editTotalOverridden, setEditTotalOverridden] = useState(false);
  const [editTotalInput, setEditTotalInput] = useState('0.00');
  const [confirmShortages, setConfirmShortages] = useState([]);

  const { data: items = [] } = useQuery({
    queryKey: ['order-items', order.id],
    queryFn: () => base44.entities.OrderItem.filter({ order_id: order.id }),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['order-history', order.id],
    queryFn: () => base44.entities.OrderStatusHistory.filter({ order_id: order.id }, '-changed_at'),
  });

  // ── Edit-mode data (products + variants, only when editing) ──────────────
  const { data: products = [] } = useQuery({
    queryKey: ['order-products'],
    queryFn: () => base44.entities.Product.filter({ status: 'Active' }, 'name', 200),
    enabled: editing,
  });
  const { data: variants = [] } = useQuery({
    queryKey: ['order-variants'],
    queryFn: () => base44.entities.ProductVariant.list('-created_date', 1000),
    enabled: editing,
  });

  const variantsByProduct = {};
  for (const v of variants) {
    if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
    variantsByProduct[v.product_id].push(v);
  }
  const editProductsById = {};
  for (const p of products) editProductsById[p.id] = p;

  function startEditing() {
    setEditItems(items.map(it => ({
      key: it.id,
      id: it.id,
      product_id: it.product_id,
      product_name: it.product_name,
      sku: it.sku || '',
      size: it.size || '',
      color: it.color || '',
      quantity: Math.max(1, Number(it.quantity) || 1),
      unit_price_usd: Number(it.unit_price_usd || 0),
    })));
    setEditErr('');
    setEditShortages([]);
    setProductSearch('');
    setShowPicker(false);
    setExpandedProductId(null);
    setAddedKey(null);
    setEditDelivery(String(Number(order.delivery_fee_usd || 0)));
    setEditTotalOverridden(!!order.total_overridden);
    setEditTotalInput(Number(order.grand_total_usd || 0).toFixed(2));
    setEditing(true);
  }

  function updateEditItem(key, field, value) {
    setEditItems(prev => prev.map(it => (it.key === key ? { ...it, [field]: value } : it)));
  }

  function addProductToEdit(product, variant = null) {
    const pvs = variantsByProduct[product.id] || [];
    const original = Number(product.price_usd) || 0;
    const effective = Number(getDiscountedPrice ? getDiscountedPrice(product) : original) || original;
    const size = variant ? (variant.size || '') : (pvs.length > 0 ? pvs[0].size || '' : '');
    const color = variant ? (variant.color || '') : (pvs.length > 0 ? pvs[0].color || '' : '');
    const unitPrice = variant?.price_usd ? Number(variant.price_usd) : effective;
    const sku = variant?.sku || product.sku || '';

    setEditItems(prev => [...prev, {
      key: `new-${Date.now()}-${Math.random()}`,
      id: null,
      product_id: product.id,
      product_name: product.name,
      sku,
      size,
      color,
      quantity: 1,
      unit_price_usd: unitPrice,
    }]);
    const key = `${product.id}|${size}|${color}`;
    setAddedKey(key);
    setTimeout(() => setAddedKey(null), 1500);
  }

  function handlePickerProductClick(product) {
    const pvs = variantsByProduct[product.id] || [];
    if (pvs.length > 0) {
      setExpandedProductId(prev => (prev === product.id ? null : product.id));
    } else {
      addProductToEdit(product, null);
    }
  }

  function removeEditItem(key) {
    setEditItems(prev => prev.filter(it => it.key !== key));
  }

  const filteredProducts = products.filter(p =>
    !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()) || (p.sku || '').toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 20);

  const editTotals = computeOrderTotals({
    items: editItems,
    orderDiscountType: order.order_discount_type || 'fixed',
    orderDiscountValue: order.order_discount_value || 0,
    deliveryFee: parseFloat(editDelivery) || 0,
    finalTotalOverride: editTotalOverridden ? (parseFloat(editTotalInput) || 0) : null,
  });

  async function saveEdit() {
    setEditErr('');
    setEditShortages([]);
    setReserveErr('');
    if (editItems.length === 0) {
      setEditErr('An order needs at least one item — use Cancel Order instead.');
      return;
    }
    for (const it of editItems) {
      if (!it.product_id) {
        setEditErr(`"${it.product_name}" is an unresolved import line — remove it and add the real product instead.`);
        return;
      }
      const product = editProductsById[it.product_id];
      const pvs = variantsByProduct[it.product_id] || [];
      if (product?.has_variants && pvs.length > 0 && !pvs.some(v => (v.size || '') === (it.size || '') && (v.color || '') === (it.color || ''))) {
        setEditErr(`Pick a valid variant for "${it.product_name}".`);
        return;
      }
      const quantity = Number(it.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        setEditErr(`Quantity for "${it.product_name}" must be at least 1.`);
        return;
      }
    }
    setEditSaving(true);
    try {
      // Atomic server-side edit: releases old lines' stock, validates new
      // ones, rewrites OrderItems and persists totals (with overrides) in one
      // transaction — or rolls everything back on shortage.
      const res = await editOrderItems(order.id, editItems.map(it => ({
        product_id: it.product_id,
        size: it.size || '',
        color: it.color || '',
        quantity: Number(it.quantity) || 1,
        unit_price_usd: Number(it.unit_price_usd) || 0,
      })), '', {
        delivery_fee_usd: parseFloat(editDelivery) || 0,
        discount_usd: editTotals.orderDiscount,
        ...(editTotalOverridden ? { grand_total_usd: parseFloat(editTotalInput) || 0, total_overridden: true } : {}),
      });
      if (!res || res.ok !== true) {
        setEditShortages(res?.shortages || []);
        setEditErr(res?.error || 'Not enough stock for this edit — nothing was changed.');
        return;
      }

      // Needs-review imports are unreserved: now that the lines are valid,
      // hold the stock. On shortage the EDIT STAYS but the order keeps its
      // needs_review flag so staff adjust quantities and retry.
      if (!order.stock_reserved && !order.stock_committed) {
        const reservation = await reserveOrderStock(order.id);
        if (reservation?.ok) {
          await base44.entities.Order.update(order.id, { needs_review: false, import_errors: null });
          setReserveErr('');
        } else {
          setEditShortages(reservation?.shortages || []);
          const names = (reservation?.shortages || []).map(x => x.name).filter(Boolean).join(', ');
          setReserveErr(`Items saved, but stock could not be reserved${names ? `: ${names}` : ' — insufficient stock'}. Adjust quantities and Edit Items again.`);
        }
      }
      await logAction({ action: 'order_items_edited', entity: 'Order', entityId: order.id, userName: currentUser?.email });

      const refreshedOrder = await base44.entities.Order.get(order.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order-items', order.id] }),
        queryClient.invalidateQueries({ queryKey: ['admin-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
      ]);

      toast({
        title: 'Order items updated',
        description: 'Line-item changes were saved successfully.',
      });
      setEditing(false);
      setShowPicker(false);
      setExpandedProductId(null);
      setProductSearch('');
      onUpdated(refreshedOrder);
    } catch (e) {
      const message = e?.data?.error || e?.message || 'Edit failed — staged changes were kept.';
      setEditErr(message);
      toast({
        title: 'Could not save line items',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setEditSaving(false);
    }
  }

  const currentIdx = STATUS_FLOW.indexOf(order.order_status);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;

  async function changeStatus(newStatus, { force = false } = {}) {
    setUpdating(true);
    setErr('');
    setConfirmShortages([]);
    try {
      // Inventory logic
      if (newStatus === 'Confirmed' && !order.stock_committed) {
        await commitStock({ orderId: order.id, force });
      }
      // Cancellation is the only path that frees stock — release whether the
      // order is merely reserved (placed, not yet confirmed) or already
      // committed. The server decides which counter to restore from the order's
      // flags; a legacy order with neither flag is a harmless no-op.
      if (newStatus === 'Cancelled' && (order.stock_committed || order.stock_reserved)) {
        await releaseStock({ orderId: order.id, items });
      }

      // Delivery triggers the consolidated backend handler (commit stock if
      // needed + recompute membership tier + customer email). Other statuses
      // update the order then notify the customer.
      if (newStatus === 'Delivered') {
        try {
          await base44.functions.invoke('onOrderDelivered', { order_id: order.id });
        } catch (e) {
          console.error('onOrderDelivered failed:', e);
        }
      } else {
        await base44.entities.Order.update(order.id, {
          order_status: newStatus,
          ...(newStatus === 'Confirmed' ? { stock_committed: true } : {}),
          ...(newStatus === 'Cancelled' && order.stock_committed ? { stock_committed: false } : {}),
        });
        try {
          await base44.functions.invoke('sendOrderStatusUpdate', { order_id: order.id, new_status: newStatus });
        } catch (e) {
          console.error('sendOrderStatusUpdate failed:', e);
        }
      }

      await base44.entities.OrderStatusHistory.create({
        order_id: order.id,
        status: newStatus,
        changed_by: currentUser?.email || 'admin',
        changed_at: new Date().toISOString(),
      });

      await logAction({ action: 'status_changed', entity: 'Order', entityId: order.id, details: `→ ${newStatus}`, userName: currentUser?.email });
      onUpdated({ ...order, order_status: newStatus, stock_committed: newStatus === 'Confirmed' || newStatus === 'Delivered' ? true : (newStatus === 'Cancelled' ? false : order.stock_committed) });
    } catch (e) {
      // Stock shortage on confirm: offer "Confirm anyway" instead of a dead
      // end. The order stays New until the admin explicitly chooses.
      const shortages = e?.data?.data?.shortages || e?.data?.shortages;
      if (newStatus === 'Confirmed' && !force && Array.isArray(shortages) && shortages.length > 0) {
        setConfirmShortages(shortages);
      } else {
        setErr(e.message);
      }
    } finally {
      setUpdating(false);
    }
  }

  function handlePrint() {
    const win = window.open('', '_blank', 'width=600,height=800');
    win.document.write(buildPrintHTML(order, items));
    win.document.close();
    win.focus();
    win.print();
  }

  function handleWhatsApp() {
    const msg = buildWhatsAppMsg(order, items);
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }

  const codAmount = order.payment_method === 'Cash on Delivery' ? order.grand_total_usd : null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="font-heading font-semibold text-foreground">Order {order.order_number || order.id.slice(0,8)}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.order_status] || 'bg-muted text-muted-foreground'}`}>
                {order.order_status}
              </span>
              <span className="text-xs text-muted-foreground">{order.channel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted text-xs font-medium hover:bg-muted/80">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button onClick={handleWhatsApp} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Needs-review import banner */}
          {(order.needs_review || reserveErr) && (
            <div className="bg-destructive/5 border border-destructive/25 rounded-xl px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-destructive">⚠ Needs review before this order can ship</p>
              {order.import_errors && <p className="text-xs text-destructive/90">{order.import_errors}</p>}
              {reserveErr && <p className="text-xs text-destructive/90">{reserveErr}</p>}
              <p className="text-xs text-muted-foreground">Fix the lines with <b>Edit Items</b> — stock is reserved automatically once everything resolves.</p>
            </div>
          )}

          {/* COD highlight */}
          {codAmount && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-amber-800">💵 Cash to Collect (COD)</span>
              <span className="text-xl font-bold text-amber-900">${codAmount.toFixed(2)}</span>
            </div>
          )}

          {/* Status stepper */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Status</h4>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {STATUS_FLOW.map((s, i) => (
                <React.Fragment key={s}>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                    s === order.order_status ? STATUS_COLORS[s] :
                    i < currentIdx ? 'bg-green-50 text-green-600' : 'bg-muted text-muted-foreground'
                  }`}>{s}</span>
                  {i < STATUS_FLOW.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                </React.Fragment>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              {nextStatus && order.order_status !== 'Cancelled' && (
                <button onClick={() => changeStatus(nextStatus)} disabled={updating || editing}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:bg-primary/90">
                  {updating ? '…' : `Mark as ${nextStatus}`}
                </button>
              )}
              {order.order_status !== 'Cancelled' && order.order_status !== 'Delivered' && (
                <button onClick={() => changeStatus('Cancelled')} disabled={updating || editing}
                  className="px-4 py-2 rounded-xl border border-destructive text-destructive text-sm font-medium disabled:opacity-50 hover:bg-destructive/10">
                  Cancel Order
                </button>
              )}
            </div>
            {err && <p className="text-xs text-destructive mt-2">{err}</p>}
            {confirmShortages.length > 0 && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-800">Not enough stock to deduct for this order:</p>
                {confirmShortages.map((sh, i) => (
                  <p key={i} className="text-xs text-amber-800">• {sh.name}: {Math.max(0, Number(sh.available) || 0)} available, {sh.needed} needed</p>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => changeStatus('Confirmed', { force: true })} disabled={updating}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50">
                    {updating ? 'Working…' : 'Confirm anyway'}
                  </button>
                  <button onClick={() => setConfirmShortages([])} disabled={updating}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-xs font-medium hover:bg-amber-100 disabled:opacity-50">
                    Keep as New
                  </button>
                </div>
                <p className="text-[11px] text-amber-700">Stock will be deducted down to zero and the shortfall stays visible in Inventory movements.</p>
              </div>
            )}
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Items</h4>
              {canEdit && !editing && (
                <button onClick={startEditing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted text-xs font-medium hover:bg-muted/80 text-foreground">
                  <Pencil className="w-3.5 h-3.5" /> Edit Items
                </button>
              )}
            </div>

            {!editing && (
            <div className="bg-muted/30 rounded-xl overflow-hidden">
              {items.map((item, i) => (
                <div key={item.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">{[item.size, item.color].filter(Boolean).join(' / ')} {item.sku && `· ${item.sku}`}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">×{item.quantity}</span>
                  <span className="text-sm font-semibold text-foreground">${(item.line_total_usd || item.unit_price_usd * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            )}

            {editing && (
              <div className="space-y-3">
                <div className="bg-muted/30 rounded-xl overflow-hidden">
                  <div className="hidden sm:grid grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_90px_90px_40px] gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                    <span>Product</span>
                    <span>Variant</span>
                    <span>Qty</span>
                    <span>Unit</span>
                    <span />
                  </div>
                  {editItems.map((it, i) => (
                    <div
                      key={it.key}
                      className={`grid grid-cols-1 sm:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_90px_90px_40px] gap-3 px-4 py-3 items-center ${i > 0 ? 'border-t border-border sm:border-t-0' : ''}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{it.product_name}</p>
                        <p className="text-xs text-muted-foreground">{it.sku || 'No SKU'}</p>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {[it.size, it.color].filter(Boolean).join(' / ') || 'Default'}
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={e => updateEditItem(it.key, 'quantity', Math.max(1, Number(e.target.value) || 1))}
                        className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-sm"
                      />
                      <div className="text-sm font-semibold text-foreground">${Number(it.unit_price_usd || 0).toFixed(2)}</div>
                      <button
                        onClick={() => removeEditItem(it.key)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        aria-label={`Remove ${it.product_name}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {editItems.length === 0 && (
                    <p className="px-4 py-6 text-sm text-muted-foreground text-center">All items removed — add one below, or cancel the order instead.</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h5 className="text-sm font-semibold text-foreground">Edit Items</h5>
                    <button
                      onClick={() => setShowPicker(p => !p)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted text-xs font-medium hover:bg-muted/80"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Product
                    </button>
                  </div>

                  {showPicker && (
                    <div className="mb-3 bg-muted/50 border border-border rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          value={productSearch}
                          onChange={e => setProductSearch(e.target.value)}
                          placeholder="Search product…"
                          className="flex-1 px-3 py-2 rounded-xl border border-input bg-background text-sm"
                        />
                        <button
                          onClick={() => { setShowPicker(false); setProductSearch(''); setExpandedProductId(null); }}
                          className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shrink-0 hover:bg-primary/90"
                        >
                          ✓ Done
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-0.5">
                        {filteredProducts.map(p => {
                          const pvs = variantsByProduct[p.id] || [];
                          const isExpanded = expandedProductId === p.id;
                          const noVariantKey = `${p.id}||`;
                          return (
                            <div key={p.id}>
                              <button
                                onClick={() => handlePickerProductClick(p)}
                                disabled={!pvs.length && editItems.some(it => it.product_id === p.id)}
                                className="w-full text-left px-3 py-2 rounded-xl hover:bg-card text-sm transition-colors flex items-center justify-between gap-2 disabled:opacity-50 disabled:hover:bg-transparent"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium text-foreground">{p.name}</span>
                                  <span className="text-muted-foreground ms-2">${p.price_usd?.toFixed(2)}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {!pvs.length && editItems.some(it => it.product_id === p.id) && (
                                    <span className="text-xs text-muted-foreground font-medium">On order — edit qty</span>
                                  )}
                                  {!pvs.length && !editItems.some(it => it.product_id === p.id) && addedKey === noVariantKey && (
                                    <span className="text-xs text-green-600 font-medium">Added ✓</span>
                                  )}
                                  {pvs.length > 0 && (
                                    <span className="text-xs text-muted-foreground">{isExpanded ? '▲' : '▼'} {pvs.length}</span>
                                  )}
                                </div>
                              </button>
                              {isExpanded && pvs.map(v => {
                                const vKey = `${p.id}|${v.size || ''}|${v.color || ''}`;
                                const isAdded = addedKey === vKey;
                                const onOrder = editItems.some(it => it.product_id === p.id && (it.size || '') === (v.size || '') && (it.color || '') === (v.color || ''));
                                const label = [v.size, v.color].filter(Boolean).join(' / ') || v.sku || '—';
                                return (
                                  <button
                                    key={`${v.sku || ''}-${v.size || ''}-${v.color || ''}`}
                                    onClick={() => addProductToEdit(p, v)}
                                    disabled={onOrder}
                                    className="w-full text-left px-5 py-1.5 rounded-xl hover:bg-card text-xs transition-colors flex items-center justify-between gap-2 ms-2 disabled:opacity-50 disabled:hover:bg-transparent"
                                  >
                                    <span className="text-foreground">{label}</span>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {v.price_usd && <span className="text-muted-foreground">${Number(v.price_usd).toFixed(2)}</span>}
                                      {onOrder && <span className="text-muted-foreground font-medium">On order</span>}
                                      {!onOrder && isAdded && <span className="text-green-600 font-medium">Added ✓</span>}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Live totals preview */}
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">New subtotal</span><span>${editTotals.subtotal.toFixed(2)}</span></div>
                  {editTotals.orderDiscount > 0 && <div className="flex justify-between text-green-700"><span>Discount (kept)</span><span>-${Number(editTotals.orderDiscount).toFixed(2)}</span></div>}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Delivery fee</span>
                    <div className="flex items-center gap-1.5">
                      {(parseFloat(editDelivery) || 0) !== Number(order.delivery_fee_usd || 0) && (
                        <button type="button" onClick={() => setEditDelivery(String(Number(order.delivery_fee_usd || 0)))}
                          className="text-[11px] text-muted-foreground hover:text-foreground underline">reset</button>
                      )}
                      <span className="text-muted-foreground">$</span>
                      <input type="number" min="0" step="0.5" value={editDelivery}
                        onChange={e => setEditDelivery(e.target.value)}
                        title="Set 0 to remove the delivery fee"
                        className="w-20 text-right px-2 py-1 rounded-lg border border-input bg-background text-sm" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 font-bold border-t border-border pt-1.5">
                    <span>New total</span>
                    <div className="flex items-center gap-1.5">
                      <button type="button"
                        onClick={() => { setEditTotalOverridden(true); setEditTotalInput(String(Math.ceil(editTotals.autoTotal))); }}
                        title="Round up to the next whole dollar"
                        className="text-[11px] font-medium px-2 py-1 rounded-lg bg-muted text-muted-foreground hover:text-foreground">Round ↑</button>
                      {editTotalOverridden && (
                        <button type="button" onClick={() => setEditTotalOverridden(false)}
                          title="Reset to auto total"
                          className="text-[11px] text-muted-foreground hover:text-foreground underline">auto</button>
                      )}
                      <span className="text-primary">$</span>
                      <input type="number" min="0" step="0.01" value={editTotalOverridden ? editTotalInput : editTotals.autoTotal.toFixed(2)}
                        onChange={e => { setEditTotalOverridden(true); setEditTotalInput(e.target.value); }}
                        className="w-24 text-right px-2 py-1 rounded-lg border border-input bg-background text-sm font-bold text-primary" />
                      {Math.abs(editTotals.grandTotal - Number(order.grand_total_usd || 0)) > 0.001 && (
                        <span className="text-xs font-normal text-muted-foreground">(was ${Number(order.grand_total_usd || 0).toFixed(2)})</span>
                      )}
                    </div>
                  </div>
                  {editTotalOverridden && (
                    <p className="text-[11px] text-amber-700 text-right">Manual total override — this is the stored total.</p>
                  )}
                  {order.payment_method === 'Cash on Delivery' && Math.abs(editTotals.grandTotal - Number(order.grand_total_usd || 0)) > 0.001 && (
                    <p className="text-xs text-amber-700 pt-1">💵 COD: tell the courier the new amount is ${editTotals.grandTotal.toFixed(2)}.</p>
                  )}
                </div>

                {editErr && <p className="text-xs text-destructive">{editErr}</p>}
                {editShortages.length > 0 && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-semibold text-destructive">Stock could not be reserved for the updated items:</p>
                    {editShortages.map((sh, i) => (
                      <p key={i} className="text-xs text-destructive">• {sh.name}: {sh.available} available, {sh.needed} needed{sh.reason ? ` (${sh.reason})` : ''}</p>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={saveEdit} disabled={editSaving}
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:bg-primary/90">
                    {editSaving ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Saving…</span> : 'Save Changes'}
                  </button>
                  <button onClick={() => { setEditing(false); setShowPicker(false); setExpandedProductId(null); setProductSearch(''); }} disabled={editSaving}
                    className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted">
                    Discard
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="bg-muted/40 rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>${(order.subtotal_usd || 0).toFixed(2)}</span></div>
            {order.discount_usd > 0 && <div className="flex justify-between text-sm text-green-700"><span>Discount</span><span>-${order.discount_usd.toFixed(2)}</span></div>}
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Delivery ({order.delivery_zone})</span><span>${(order.delivery_fee_usd || 0).toFixed(2)}</span></div>
            <div className="flex justify-between font-bold border-t border-border pt-2 mt-2"><span>Total</span><span className="text-primary">${(order.grand_total_usd || 0).toFixed(2)}</span></div>
          </div>

          {/* Customer & Address */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Customer</h4>
              <div className="bg-muted/30 rounded-xl p-3 space-y-1">
                <p className="text-sm font-medium text-foreground">{order.customer_name}</p>
                <p className="text-sm text-muted-foreground">{order.customer_phone}</p>
                <p className="text-xs text-muted-foreground">{order.payment_method}</p>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Address</h4>
              <div className="bg-muted/30 rounded-xl p-3 text-sm text-muted-foreground space-y-0.5">
                {order.building && <p>Bldg {order.building}{order.floor ? `, Fl ${order.floor}` : ''}{order.apartment ? `, Apt ${order.apartment}` : ''}</p>}
                {order.street && <p>{order.street}</p>}
                {order.district && <p>{order.district}</p>}
                <p className="font-medium text-foreground">{order.city}</p>
                {order.landmark && <p className="text-xs">Near: {order.landmark}</p>}
              </div>
            </div>
          </div>

          {/* Gift options */}
          {order.is_gift && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5" /> Gift
              </h4>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1.5 text-sm">
                <p className="font-semibold text-amber-800">🎁 This order is a gift</p>
                <div className="flex flex-wrap gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.gift_wrapping ? 'bg-amber-200 text-amber-900' : 'bg-muted text-muted-foreground'}`}>
                    {order.gift_wrapping ? '✓ Gift wrapping' : 'No wrapping'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.hide_invoice_price ? 'bg-amber-200 text-amber-900' : 'bg-muted text-muted-foreground'}`}>
                    {order.hide_invoice_price ? '✓ Hide prices on slip' : 'Prices shown'}
                  </span>
                </div>
                {order.gift_message && (
                  <p className="text-amber-900 italic bg-white/60 rounded-lg px-3 py-2 mt-1">“{order.gift_message}”</p>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {order.notes && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</h4>
              <p className="text-sm text-foreground bg-muted/30 rounded-xl px-4 py-3">{order.notes}</p>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Status History</h4>
              <div className="space-y-1.5">
                {history.map(h => (
                  <div key={h.id} className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[h.status] || 'bg-muted text-muted-foreground'}`}>{h.status}</span>
                    <span>{h.changed_by}</span>
                    <span>{h.changed_at ? new Date(h.changed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildPrintHTML(order, items) {
  // When a gift order requests price masking, omit all prices/totals (and the
  // COD amount) from the printed packing slip so the recipient never sees them.
  const hidePrice = !!(order.is_gift && order.hide_invoice_price);
  const itemsHTML = items.map(i => {
    const label = `${i.product_name}${i.size ? ` (${i.size}` : ''}${i.color ? `/${i.color})` : i.size ? ')' : ''}`;
    const priceCell = hidePrice ? '' : `<td style="text-align:right">$${(i.line_total_usd || i.unit_price_usd * i.quantity).toFixed(2)}</td>`;
    return `<tr><td>${label}</td><td style="text-align:center">${i.quantity}</td>${priceCell}</tr>`;
  }).join('');
  const priceHeader = hidePrice ? '' : '<th style="text-align:right">Total</th>';
  const totalsRows = hidePrice ? '' :
    `<tr class="total-row"><td colspan="2">Delivery</td><td style="text-align:right">$${(order.delivery_fee_usd || 0).toFixed(2)}</td></tr>
     <tr class="total-row"><td colspan="2">GRAND TOTAL</td><td style="text-align:right">$${(order.grand_total_usd || 0).toFixed(2)}</td></tr>`;
  const codBlock = (!hidePrice && order.payment_method === 'Cash on Delivery')
    ? `<div class="cod">💵 COD Amount to Collect: $${(order.grand_total_usd || 0).toFixed(2)}</div>` : '';
  const giftBlock = order.is_gift
    ? `<div class="gift">🎁 Gift${order.gift_wrapping ? ' · please gift-wrap' : ''}${order.gift_message ? `<br/><em>"${order.gift_message}"</em>` : ''}</div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Order ${order.order_number}</title>
  <style>body{font-family:Arial,sans-serif;font-size:13px;padding:20px;color:#222}h1{font-size:20px;margin-bottom:4px}.label{color:#888;font-size:11px}table{width:100%;border-collapse:collapse;margin:12px 0}th{background:#f0f0f0;padding:6px 8px;text-align:left;font-size:11px}td{padding:6px 8px;border-bottom:1px solid #eee}.total-row td{font-weight:bold;border-top:2px solid #222}.cod{background:#fffbe6;border:1px solid #f6c90e;padding:8px 12px;border-radius:6px;font-size:15px;font-weight:bold;margin-top:12px}.gift{background:#fff7ed;border:1px dashed #d97706;padding:8px 12px;border-radius:6px;margin-top:12px}</style>
  </head><body>
  <h1>AURA — ${hidePrice ? 'Packing Slip' : 'Order Slip'}</h1>
  <p class="label">Order #</p><p><strong>${order.order_number}</strong></p>
  <p class="label">Date</p><p>${order.order_date ? new Date(order.order_date).toLocaleDateString('en-GB') : ''}</p>
  <p class="label">Customer</p><p>${order.customer_name} · ${order.customer_phone}</p>
  <p class="label">Address</p><p>${[order.building, order.street, order.district, order.city].filter(Boolean).join(', ')}</p>
  <p class="label">Zone</p><p>${order.delivery_zone || ''}</p>
  <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th>${priceHeader}</tr></thead>
  <tbody>${itemsHTML}${totalsRows}</tbody></table>
  <p class="label">Payment</p><p>${order.payment_method}</p>
  ${codBlock}
  ${giftBlock}
  ${order.notes ? `<p class="label">Notes</p><p>${order.notes}</p>` : ''}
  </body></html>`;
}

function buildWhatsAppMsg(order, items) {
  const customerName = order.customer_name || 'dear customer';
  return `Hello dear ${customerName} 🙂\n\nThis is Amir from AURA, just checking in to make sure your order arrived safely and everything is perfect on your end.\n\nWe'd love to hear what you think once you try our Apparel wear, your feedback really means a lot to us! 💬\n\nThank you again for choosing Aura.Wear`;
}