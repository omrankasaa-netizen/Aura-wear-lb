import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { X, Plus, Trash2, Camera, Loader2 } from 'lucide-react';
import { logAction } from '@/lib/auditLog';
import { useLang } from '@/contexts/LanguageContext';
import { useDiscounts } from '@/contexts/DiscountContext';
import { computeOrderTotals } from '@/lib/orderPricing';
import { reserveOrderStock } from '@/lib/inventory';

const DELIVERY_FEES = { 'Inside Tripoli': 3, 'Outside Tripoli': 5 };
const CHANNELS = ['Website', 'Instagram', 'Facebook', 'WhatsApp', 'Other'];
const PAYMENT_METHODS = ['Cash on Delivery', 'Whish'];
const LB_CITIES = ['Tripoli', 'Beirut', 'Sidon', 'Tyre', 'Jounieh', 'Baalbek', 'Zahle', 'Other'];

function generateOrderNumber() {
  const n = Math.floor(Math.random() * 90000) + 10000;
  return `AURA-${n}`;
}

export default function NewOrderModal({ onClose, onSaved, currentUser }) {
  const { t, isRTL } = useLang();
  const { getProductDiscount, getDiscountedPrice } = useDiscounts();

  const [form, setForm] = useState({
    customer_name: '', customer_phone: '',
    city: 'Tripoli', district: '', street: '', building: '', floor: '', apartment: '', landmark: '',
    delivery_zone: 'Inside Tripoli', delivery_fee_usd: 3,
    channel: 'Instagram', payment_method: 'Cash on Delivery',
    promo_code: '', notes: '',
    order_discount_type: 'fixed', // 'fixed' ($) | 'percent' (%)
    order_discount_value: 0,
    final_total_override: '', // blank = use auto total
  });
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  // ── Invoice photo scan → prefill (name/phone/address/amount) ────────────
  // Products are still added by hand; the scan only fills the contact fields
  // and keeps the invoice total as a cross-check against the computed total.
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [scanErr, setScanErr] = useState('');
  const [scannedAmount, setScannedAmount] = useState(null); // { amount, currency }
  const invoiceInputRef = useRef(null);

  // Resize the photo to max ~1600px on the long edge and re-encode as JPEG
  // (~85%). Falls back to the raw file if canvas decoding fails (e.g. HEIC
  // on a browser that can't decode it).
  function downscaleForScan(file) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        if (scale >= 1 && file.size < 2.5 * 1024 * 1024) {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      };
      img.src = url;
    });
  }

  async function handleInvoiceFile(file) {
    if (!file) return;
    setScanning(true);
    setScanMsg('');
    setScanErr('');
    try {
      // Downscale before upload: phone photos can be 8-12MB, which inflates
      // ~33% as base64 and can exceed the request body limit — that was the
      // "fails immediately" failure. 1600px is plenty for OCR.
      const dataUrl = await downscaleForScan(file);
      const base64 = String(dataUrl).split(',')[1] || '';
      const res = await base44.functions.invoke('scanInvoice', {
        image_base64: base64,
        media_type: 'image/jpeg',
      });
      const payload = res?.data || res;
      if (!payload?.ok) throw new Error(payload?.error || 'Scan failed');
      const f = payload.fields || {};
      const filled = [];
      if (f.customer_name) { setField('customer_name', f.customer_name); filled.push('name'); }
      if (f.customer_phone) { setField('customer_phone', f.customer_phone); filled.push('phone'); }
      if (f.city) {
        const match = LB_CITIES.find(c => c.toLowerCase() === String(f.city).toLowerCase())
          || (/(saidon|saida)/i.test(f.city) ? 'Sidon' : null);
        if (match) setField('city', match);
      }
      if (f.address) { setField('street', f.address); filled.push('address'); }
      if (f.amount) setScannedAmount({ amount: f.amount, currency: f.currency || 'USD' });
      if (f.notes) setField('notes', (form.notes ? form.notes + ' · ' : '') + f.notes);
      setScanMsg(
        (payload.engine === 'ocr' || payload.engine === 'vision-ocr'
          ? t('Scanned (text OCR — double-check everything): ', 'تم المسح (OCR نصي — تحقق من كل شيء): ')
          : t('Scanned: ', 'تم المسح: '))
        + (filled.length ? filled.join(', ') : t('nothing readable — fill manually', 'لا شيء مقروء — عبّئ يدوياً'))
      );
    } catch (e) {
      setScanErr(e?.data?.error || e?.data?.data?.error || e.message || 'Scan failed');
    } finally {
      setScanning(false);
      if (invoiceInputRef.current) invoiceInputRef.current.value = '';
    }
  }

  const { data: products = [] } = useQuery({
    queryKey: ['order-products'],
    queryFn: () => base44.entities.Product.filter({ status: 'Active' }, 'name', 200),
  });
  const { data: variants = [] } = useQuery({
    queryKey: ['order-variants'],
    queryFn: () => base44.entities.ProductVariant.list('-created_date', 1000),
  });

  const variantsByProduct = {};
  for (const v of variants) {
    if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
    variantsByProduct[v.product_id].push(v);
  }

  // Live totals — reuses the same math (and stored fields) as persistence.
  const totals = computeOrderTotals({
    items,
    orderDiscountType: form.order_discount_type,
    orderDiscountValue: form.order_discount_value,
    deliveryFee: form.delivery_fee_usd,
    finalTotalOverride: form.final_total_override,
  });

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function onZoneChange(zone) {
    setForm(f => ({ ...f, delivery_zone: zone, delivery_fee_usd: DELIVERY_FEES[zone] ?? 3 }));
  }

  function addProductToOrder(product) {
    const pvs = variantsByProduct[product.id] || [];
    // Default to the storefront's effective (discounted) price so manual orders
    // don't over-charge / over-report revenue. Admin can still override below.
    const original = Number(product.price_usd) || 0;
    const effective = Number(getDiscountedPrice ? getDiscountedPrice(product) : original) || original;
    const discount = getProductDiscount ? getProductDiscount(product) : null;
    const newItem = {
      _id: Date.now() + Math.random(),
      product_id: product.id,
      product_name: product.name,
      sku: product.sku || '',
      size: pvs.length > 0 ? pvs[0].size || '' : '',
      color: pvs.length > 0 ? pvs[0].color || '' : '',
      unit_price_usd: effective,
      original_price_usd: original,
      auto_discounted: !!discount && effective < original,
      quantity: 1,
      availableSizes: pvs.length > 0 ? [...new Set(pvs.map(v => v.size).filter(Boolean))] : [],
      availableColors: pvs.length > 0 ? [...new Set(pvs.map(v => v.color).filter(Boolean))] : [],
      hasVariants: pvs.length > 0,
    };
    setItems(prev => [...prev, newItem]);
    setShowPicker(false);
    setProductSearch('');
  }

  function updateItem(id, field, value) {
    setItems(prev => prev.map(i => i._id === id ? { ...i, [field]: value } : i));
  }

  function removeItem(id) {
    setItems(prev => prev.filter(i => i._id !== id));
  }

  async function handleSave() {
    if (!form.customer_name || !form.customer_phone) {
      setError(t('Customer name and phone are required.', 'اسم العميل ورقم الهاتف مطلوبان.'));
      return;
    }
    if (items.length === 0) {
      setError(t('Add at least one product.', 'أضف منتجًا واحدًا على الأقل.'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const order_number = generateOrderNumber();
      const order = await base44.entities.Order.create({
        order_number,
        order_date: new Date().toISOString(),
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        city: form.city,
        district: form.district,
        street: form.street,
        building: form.building,
        floor: form.floor,
        apartment: form.apartment,
        landmark: form.landmark,
        delivery_zone: form.delivery_zone,
        delivery_fee_usd: totals.deliveryFee,
        channel: form.channel,
        payment_method: form.payment_method,
        subtotal_usd: totals.subtotal,
        discount_usd: totals.orderDiscount,
        order_discount_type: form.order_discount_type,
        order_discount_value: Number(form.order_discount_value) || 0,
        grand_total_usd: totals.grandTotal,
        total_overridden: totals.totalOverridden,
        order_status: 'New',
        stock_committed: false,
        promo_code: form.promo_code,
        notes: form.notes,
      });

      for (const item of items) {
        await base44.entities.OrderItem.create({
          order_id: order.id,
          product_id: item.product_id,
          product_name: item.product_name,
          sku: item.sku,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          unit_price_usd: Number(item.unit_price_usd) || 0,
          line_total_usd: (Number(item.unit_price_usd) || 0) * (Number(item.quantity) || 0),
        });
      }

      // Hold inventory immediately for manual orders too, so they can't oversell
      // against storefront orders. A shortage cancels the order server-side.
      const reservation = await reserveOrderStock(order.id);
      if (!reservation?.ok) {
        const names = (reservation?.shortages || []).map(s => s.name).filter(Boolean).join(', ');
        setError(
          names
            ? t(`Insufficient stock: ${names}`, `مخزون غير كافٍ: ${names}`)
            : t('Insufficient stock to reserve this order.', 'المخزون غير كافٍ لحجز هذا الطلب.')
        );
        setSaving(false);
        return;
      }

      await base44.entities.OrderStatusHistory.create({
        order_id: order.id,
        status: 'New',
        note: 'Order created manually',
        changed_by: currentUser?.email || 'admin',
        changed_at: new Date().toISOString(),
      });

      await logAction({ action: 'created', entity: 'Order', entityId: order.id, details: order_number, userName: currentUser?.email });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const filteredProducts = products.filter(p =>
    !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()) || (p.sku || '').toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 20);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-heading font-semibold text-foreground">{t('New Order', 'طلب جديد')}</h3>
          <div className="flex items-center gap-2">
            <input
              ref={invoiceInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleInvoiceFile(e.target.files?.[0])}
            />
            <button
              onClick={() => invoiceInputRef.current?.click()}
              disabled={scanning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-medium hover:bg-primary/15 disabled:opacity-50"
              title={t('Upload an invoice photo — name, phone, address and amount are filled in automatically', 'ارفع صورة الفاتورة — الاسم والهاتف والعنوان والمبلغ تُعبأ تلقائياً')}
            >
              {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              {scanning ? t('Scanning…', 'جارٍ المسح…') : t('Scan Invoice', 'مسح فاتورة')}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {(scanMsg || scanErr || scannedAmount) && (
            <div className="space-y-1.5">
              {scanMsg && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">{scanMsg}</p>}
              {scanErr && <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">{scanErr}</p>}
              {scannedAmount && (
                <p className={`text-xs rounded-xl px-3 py-2 border ${
                  Math.abs((totals?.grandTotal || 0) - scannedAmount.amount) < 0.01
                    ? 'text-green-700 bg-green-50 border-green-200'
                    : 'text-amber-800 bg-amber-50 border-amber-200'
                }`}>
                  {t('Invoice total detected:', 'المبلغ على الفاتورة:')} {scannedAmount.currency === 'LBP' ? `${scannedAmount.amount.toLocaleString()} LBP` : `$${scannedAmount.amount.toFixed(2)}`}
                  {scannedAmount.currency === 'USD' && Math.abs((totals?.grandTotal || 0) - scannedAmount.amount) >= 0.01 &&
                    ` — ${t('order total so far is', 'مجموع الطلب حالياً')} $${(totals?.grandTotal || 0).toFixed(2)}`}
                </p>
              )}
            </div>
          )}
          {/* Channel + Payment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">{t('Channel', 'القناة')}</label>
              <select value={form.channel} onChange={e => setField('channel', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                {CHANNELS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">{t('Payment Method', 'طريقة الدفع')}</label>
              <select value={form.payment_method} onChange={e => setField('payment_method', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Customer */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">{t('Customer', 'العميل')}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('Name *', 'الاسم *')}</label>
                <input value={form.customer_name} onChange={e => setField('customer_name', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder={t('Full name', 'الاسم الكامل')} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('Phone *', 'الهاتف *')}</label>
                <input value={form.customer_phone} onChange={e => setField('customer_phone', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="+961 xx xxx xxx" />
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">{t('Delivery Address', 'عنوان التوصيل')}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('City', 'المدينة')}</label>
                <select value={form.city} onChange={e => setField('city', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                  {LB_CITIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('District', 'المنطقة')}</label>
                <input value={form.district} onChange={e => setField('district', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder={t('e.g. Mina', 'مثال: الميناء')} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground block mb-1">{t('Street', 'الشارع')}</label>
                <input value={form.street} onChange={e => setField('street', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder={t('Street name', 'اسم الشارع')} />
              </div>
              {[['building', t('Building', 'المبنى')], ['floor', t('Floor', 'الطابق')], ['apartment', t('Apartment', 'الشقة')]].map(([k, l]) => (
                <div key={k}>
                  <label className="text-xs text-muted-foreground block mb-1">{l}</label>
                  <input value={form[k]} onChange={e => setField(k, e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
                </div>
              ))}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('Landmark', 'علامة مميزة')}</label>
                <input value={form.landmark} onChange={e => setField('landmark', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder={t('Near mosque, school…', 'قرب مسجد، مدرسة…')} />
              </div>
            </div>
          </div>

          {/* Delivery Zone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">{t('Delivery Zone', 'منطقة التوصيل')}</label>
              <select value={form.delivery_zone} onChange={e => onZoneChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm">
                <option>Inside Tripoli</option>
                <option>Outside Tripoli</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">{t('Delivery Fee ($)', 'رسوم التوصيل ($)')}</label>
              <input type="number" min="0" step="0.5" value={form.delivery_fee_usd}
                onChange={e => setField('delivery_fee_usd', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
          </div>

          {/* Products */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-foreground">{t('Products', 'المنتجات')}</h4>
              <button onClick={() => setShowPicker(p => !p)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted text-xs font-medium hover:bg-muted/80">
                <Plus className="w-3.5 h-3.5" /> {t('Add Product', 'إضافة منتج')}
              </button>
            </div>

            {showPicker && (
              <div className="mb-3 bg-muted/50 border border-border rounded-xl p-3 space-y-2">
                <input value={productSearch} onChange={e => setProductSearch(e.target.value)}
                  placeholder={t('Search product…', 'ابحث عن منتج…')}
                  className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {filteredProducts.map(p => (
                    <button key={p.id} onClick={() => addProductToOrder(p)}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-card text-sm transition-colors">
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="text-muted-foreground ms-2">${p.price_usd?.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-xl">{t('No products added yet', 'لم تتم إضافة منتجات بعد')}</p>}
              {items.map(item => (
                <div key={item._id} className="flex items-center gap-3 bg-muted/30 border border-border rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.product_name}</p>
                    <div className="flex gap-2 mt-1 flex-wrap items-center">
                      {item.availableSizes.length > 0 && (
                        <select value={item.size} onChange={e => updateItem(item._id, 'size', e.target.value)}
                          className="px-2 py-1 rounded-lg border border-input bg-background text-xs">
                          {item.availableSizes.map(s => <option key={s}>{s}</option>)}
                        </select>
                      )}
                      {item.availableColors.length > 0 && (
                        <select value={item.color} onChange={e => updateItem(item._id, 'color', e.target.value)}
                          className="px-2 py-1 rounded-lg border border-input bg-background text-xs">
                          {item.availableColors.map(c => <option key={c}>{c}</option>)}
                        </select>
                      )}
                      {/* Per-item unit price override */}
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">{t('Unit $', 'سعر الوحدة $')}</span>
                        <input type="number" min="0" step="0.01" value={item.unit_price_usd}
                          onChange={e => updateItem(item._id, 'unit_price_usd', Math.max(0, Number(e.target.value)))}
                          className="w-20 px-2 py-1 rounded-lg border border-input bg-background text-xs" />
                        {item.auto_discounted && item.original_price_usd > item.unit_price_usd && (
                          <span className="text-[11px] text-muted-foreground line-through">${item.original_price_usd.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input type="number" min="1" value={item.quantity} onChange={e => updateItem(item._id, 'quantity', Math.max(1, Number(e.target.value)))}
                      className="w-14 text-center px-2 py-1.5 rounded-lg border border-input bg-background text-sm" />
                    <span className="text-sm font-semibold text-foreground w-16 text-right">${((Number(item.unit_price_usd) || 0) * item.quantity).toFixed(2)}</span>
                    <button onClick={() => removeItem(item._id)} className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order-level discount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">{t('Order Discount', 'خصم الطلب')}</label>
              <div className="flex">
                <input type="number" min="0" step="0.01" value={form.order_discount_value}
                  onChange={e => setField('order_discount_value', Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 rounded-s-xl border border-input bg-background text-sm" />
                <select value={form.order_discount_type} onChange={e => setField('order_discount_type', e.target.value)}
                  className="px-2 py-2 rounded-e-xl border border-s-0 border-input bg-background text-sm">
                  <option value="fixed">$</option>
                  <option value="percent">%</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">{t('Final Total Override ($)', 'تجاوز الإجمالي النهائي ($)')}</label>
              <input type="number" min="0" step="0.01" value={form.final_total_override}
                onChange={e => setField('final_total_override', e.target.value)}
                placeholder={totals.autoTotal.toFixed(2)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">{t('Notes', 'ملاحظات')}</label>
            <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm resize-none"
              placeholder={t('Special instructions…', 'تعليمات خاصة…')} />
          </div>

          {/* Totals */}
          <div className="bg-muted/40 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('Subtotal', 'المجموع الفرعي')}</span><span className="font-medium">${totals.subtotal.toFixed(2)}</span></div>
            {totals.orderDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-700"><span>{t('Order Discount', 'خصم الطلب')}</span><span>-${totals.orderDiscount.toFixed(2)}</span></div>
            )}
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('Delivery Fee', 'رسوم التوصيل')}</span><span className="font-medium">${totals.deliveryFee.toFixed(2)}</span></div>
            <div className="flex justify-between text-base font-bold border-t border-border pt-2 mt-2">
              <span>{t('Total', 'الإجمالي')}</span><span className="text-primary">${totals.grandTotal.toFixed(2)}</span>
            </div>
            {totals.totalOverridden && (
              <p className="text-[11px] text-amber-700">
                {t(`Total manually overridden (auto: $${totals.autoTotal.toFixed(2)})`, `تم تجاوز الإجمالي يدويًا (تلقائي: $${totals.autoTotal.toFixed(2)})`)}
              </p>
            )}
            {form.payment_method === 'Cash on Delivery' && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm font-semibold text-amber-800">
                💵 {t('COD Amount to Collect:', 'المبلغ المطلوب تحصيله عند الاستلام:')} ${totals.grandTotal.toFixed(2)}
              </div>
            )}
          </div>
        </div>

        {error && <p className="px-6 text-xs text-destructive">{error}</p>}

        <div className="flex gap-3 p-6 border-t border-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">{t('Cancel', 'إلغاء')}</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {saving ? t('Saving…', 'جارٍ الحفظ…') : t('Create Order', 'إنشاء الطلب')}
          </button>
        </div>
      </div>
    </div>
  );
}
