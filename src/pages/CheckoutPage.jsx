import React, { useState, useEffect } from 'react';
import { useCart } from '@/contexts/CartContext';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { useLang } from '@/contexts/LanguageContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { base44 } from '@/api/base44Client';
import { useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, Tag, X, Loader2, Gift } from 'lucide-react';
import { validatePromoCode, calcPromoDiscount } from '@/lib/discounts';
import { useQuery } from '@tanstack/react-query';
import { trackInitiateCheckout, trackPurchase, newEventId } from '@/lib/meta';
import { reserveOrderStock } from '@/lib/inventory';

const ScrollToTop = ({ trigger }) => {
  useEffect(() => {
    if (trigger) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [trigger]);
  return null;
};

const CITIES = ['Beirut', 'Mount Lebanon', 'Tripoli', 'Jounieh', 'Sidon', 'Tyre', 'Zahle', 'Batroun', 'Jbeil', 'Other'];

function genOrderNum() {
  return 'AURA-' + String(Math.floor(Math.random() * 99999) + 1).padStart(5, '0');
}

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const { currentUser } = useAuthUser();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const siteSettings = useSiteSettings();

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-for-checkout', currentUser?.email],
    queryFn: () => currentUser?.email
      ? base44.entities.Customer.filter({ email: currentUser.email }, '-created_date', 1)
      : Promise.resolve([]),
    enabled: !!currentUser?.email
  });

  const { data: memSettings = [] } = useQuery({
    queryKey: ['membership-settings-checkout'],
    queryFn: () => base44.entities.MembershipSettings.list(),
  });

  const { data: shippingZones = [] } = useQuery({
    queryKey: ['shipping-zones-checkout'],
    queryFn: async () => {
      const zones = await base44.entities.ShippingZone.filter({ is_active: true }, 'sort_order', 100);
      return zones;
    },
  });

  const customer = customers[0];
  const settings = memSettings[0] || {
    bronze_discount_pct: 5,
    silver_discount_pct: 10,
    gold_discount_pct: 15
  };
  const memberDiscount = customer && memSettings.length > 0
    ? {
        Bronze: settings.bronze_discount_pct || 5,
        Silver: settings.silver_discount_pct || 10,
        Gold: settings.gold_discount_pct || 15
      }[customer.current_tier || 'Bronze']
    : 0;

  const enabledMethods = [
    siteSettings.paymentCodEnabled && { key: 'Cash on Delivery', label: t('Cash on Delivery', 'الدفع عند الاستلام') },
    siteSettings.paymentWhishEnabled && { key: 'Whish', label: 'Whish' },
    siteSettings.paymentCardEnabled && { key: 'Card', label: t('Credit/Debit Card', 'بطاقة ائتمان') },
  ].filter(Boolean);

  const [form, setForm] = useState({
    customer_name: currentUser?.full_name || '',
    customer_phone: currentUser?.phone || '',
    customer_email: currentUser?.email || '',
    city: '',
    district: '',
    street: '',
    building: '',
    floor: '',
    landmark: '',
    shipping_zone_id: '',
    payment_method: currentUser?.preferred_payment || 'Cash on Delivery',
    notes: '',
  });

  const [createAccount, setCreateAccount] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [addressChanged, setAddressChanged] = useState(false);

  const [gift, setGift] = useState({
    is_gift: false,
    gift_wrapping: false,
    hide_invoice_price: false,
    gift_message: '',
  });
  const GIFT_MSG_MAX = 150;
  function setGiftField(k, v) {
    setGift(g => ({ ...g, [k]: v }));
  }

  useEffect(() => {
    if (currentUser?.id && customer && !addressChanged) {
      const tryLoadAddress = async () => {
        try {
          const addresses = await base44.entities.CustomerAddress?.filter?.({ customer_id: customer.id }, 'created_date', 1);
          if (addresses?.length > 0) {
            const addr = addresses[0];
            setForm(f => ({
              ...f,
              city: addr.city || '',
              district: addr.district || '',
              street: addr.street || '',
              building: addr.building || '',
              floor: addr.floor || '',
              landmark: addr.landmark || '',
            }));
          }
        } catch (e) {
          // CustomerAddress might not exist; that's ok
        }
      };
      tryLoadAddress();
    }
  }, [currentUser?.id, customer?.id]);

  useEffect(() => {
    if (enabledMethods.length && !enabledMethods.find(m => m.key === form.payment_method)) {
      setF('payment_method', enabledMethods[0].key);
    }
  }, [siteSettings.paymentCodEnabled, siteSettings.paymentWhishEnabled, siteSettings.paymentCardEnabled]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  // Meta InitiateCheckout — fire once when the checkout page loads with items.
  const initiateFired = React.useRef(false);
  useEffect(() => {
    if (initiateFired.current || !items || items.length === 0) return;
    initiateFired.current = true;
    trackInitiateCheckout(items, subtotal);
  }, [items, subtotal]);
  const [promoInput, setPromoInput] = useState('');
  const [promoCode, setPromoCode] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [stockError, setStockError] = useState('');

  const isFreeShipping = promoCode?.type === 'free_shipping';
  const promoDiscount = promoCode && items?.length > 0 ? (calcPromoDiscount(promoCode, items, subtotal) ?? 0) : 0;

  let postDiscountSubtotal = Number(subtotal || 0);
  if (memberDiscount > 0 && promoDiscount > 0) {
    if (promoCode?.stackable_with_membership) {
      postDiscountSubtotal = postDiscountSubtotal - ((postDiscountSubtotal * memberDiscount) / 100) - promoDiscount;
    } else {
      const memberDiscountAmt = (postDiscountSubtotal * memberDiscount) / 100;
      postDiscountSubtotal = memberDiscountAmt > promoDiscount ? postDiscountSubtotal - memberDiscountAmt : postDiscountSubtotal - promoDiscount;
    }
  } else if (memberDiscount > 0) {
    postDiscountSubtotal = postDiscountSubtotal - ((postDiscountSubtotal * memberDiscount) / 100);
  } else if (promoDiscount > 0) {
    postDiscountSubtotal = postDiscountSubtotal - promoDiscount;
  }

  const freeShippingThreshold = Number(siteSettings.freeShippingThreshold || 50);
  const qualifiesForThreshold = postDiscountSubtotal >= freeShippingThreshold;

  const selectedZone = form.shipping_zone_id ? shippingZones.find(z => z.id === form.shipping_zone_id) : null;
  const catchallZone = shippingZones.find(z => z.is_catchall);
  const zoneForFee = selectedZone || catchallZone || { fee_usd: 6 };
  const deliveryFee = Number(zoneForFee?.fee_usd || 6);

  let effectivePromoDiscount = Number(promoDiscount || 0);
  let effectiveMemberDiscount = 0;

  if (memberDiscount > 0 && promoDiscount > 0) {
    if (promoCode?.stackable_with_membership) {
      effectiveMemberDiscount = (subtotal * memberDiscount) / 100;
    } else {
      const memberDiscountAmt = (subtotal * memberDiscount) / 100;
      if (memberDiscountAmt > promoDiscount) {
        effectivePromoDiscount = 0;
        effectiveMemberDiscount = memberDiscountAmt;
      } else {
        effectiveMemberDiscount = 0;
      }
    }
  } else if (memberDiscount > 0) {
    effectiveMemberDiscount = (subtotal * memberDiscount) / 100;
  }

  const totalDiscount = Number(effectivePromoDiscount + effectiveMemberDiscount);
  const effectiveDelivery = isFreeShipping || qualifiesForThreshold ? 0 : deliveryFee;
  const grandTotal = Number((subtotal - totalDiscount + effectiveDelivery).toFixed(2));

  async function handleApplyPromo() {
    setPromoError('');
    setPromoLoading(true);
    const codes = await base44.entities.PromoCode.filter({ code: promoInput.toUpperCase().trim() }, 'code', 1);
    setPromoLoading(false);
    if (!codes.length) { setPromoError(t('Invalid promo code.', 'رمز ترويجي غير صحيح.')); return; }
    const code = codes[0];
    const { valid, reason } = validatePromoCode(code, items, subtotal, lang);
    if (!valid) { setPromoError(reason); return; }
    setPromoCode(code);
    setPromoInput('');
  }

  function removePromo() { setPromoCode(null); setPromoError(''); }

  function setF(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    if (k === 'customer_email') setEmailError('');
  }

  function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  function validateLebanesePhone(phone) {
    let c = String(phone || '').replace(/[\s\-()]/g, '');
    c = c.replace(/^\+961/, '').replace(/^00961/, '').replace(/^961/, '').replace(/^0/, '');
    const mobile = /^(3\d{6}|7[0-9]\d{6}|8[01]\d{6})$/;
    const landline = /^[1-9]\d{6}$/;
    return mobile.test(c) || landline.test(c);
  }

  async function revalidateStock() {
    const issues = [];
    for (const item of items) {
      try {
        const currentProduct = await base44.entities.Product.get(item.product.id);
        if (!currentProduct) {
          issues.push(`${item.product.name} is no longer available`);
        } else if (currentProduct.has_variants) {
          const variant = await base44.entities.ProductVariant?.filter?.(
            { product_id: item.product.id, size: item.variant?.size, color: item.variant?.color },
            'id',
            1
          );
          if (!variant?.length || variant[0].stock_quantity < item.quantity) {
            issues.push(`${item.product.name} (${item.variant?.size}/${item.variant?.color}): only ${variant?.[0]?.stock_quantity || 0} left`);
          }
        } else if (currentProduct.stock_quantity < item.quantity) {
          issues.push(`${item.product.name}: only ${currentProduct.stock_quantity} left`);
        }
      } catch (e) {
        console.error('Stock check failed:', e);
      }
    }
    return issues;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setEmailError('');
    setPhoneError('');
    setStockError('');
    setSubmitting(true);

    if (!form.customer_email || !form.customer_email.trim()) {
      setEmailError(t('Email is required', 'البريد الإلكتروني مطلوب'));
      setSubmitting(false);
      return;
    }

    if (!validateEmail(form.customer_email)) {
      setEmailError(t('Please enter a valid email address', 'يرجى إدخال عنوان بريد إلكتروني صحيح'));
      setSubmitting(false);
      return;
    }

    if (!form.customer_phone || !form.customer_phone.trim()) {
      setPhoneError(t('Phone is required for COD delivery', 'الهاتف مطلوب للتوصيل عند الاستلام'));
      setSubmitting(false);
      return;
    }

    if (!validateLebanesePhone(form.customer_phone)) {
      setPhoneError(t('Please enter a valid Lebanese phone number (e.g. 03/70/71/76/78/79/81 or +961)', 'يرجى إدخال رقم هاتف لبناني صحيح'));
      setSubmitting(false);
      return;
    }

    const stockIssues = await revalidateStock();
    if (stockIssues.length > 0) {
      setStockError(stockIssues.join('; '));
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      let guestCustomerId = currentUser?.id || '';
      if (!currentUser && createAccount) {
        // Generic Customer reads are auth-gated, so we can no longer check for an
        // existing account from the client. Delegate find-or-create to a
        // server-trusted, idempotent upsert that also seeds Bronze membership +
        // welcome email on first creation. The response is account-enumeration
        // safe (identical whether the email pre-existed), so no PII leaks back.
        try {
          const res = await base44.functions.invoke('upsertCustomerForOrder', {
            email: form.customer_email,
            name: form.customer_name,
            phone: form.customer_phone
          });
          if (res?.data?.customer_id) guestCustomerId = res.data.customer_id;
        } catch (err) {
          console.error('Account creation failed:', err);
        }
      }

      const order = await base44.entities.Order.create({
        customer_id: guestCustomerId,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_email: form.customer_email,
        city: form.city,
        district: form.district,
        street: form.street,
        building: form.building,
        floor: form.floor,
        landmark: form.landmark,
        shipping_zone_id: form.shipping_zone_id,
        payment_method: form.payment_method,
        notes: form.notes,
        order_number: genOrderNum(),
        order_date: new Date().toISOString(),
        subtotal_usd: subtotal,
        discount_usd: totalDiscount,
        delivery_fee_usd: effectiveDelivery,
        grand_total_usd: grandTotal,
        promo_code: promoCode?.code || '',
        order_status: 'New',
        channel: 'Website',
        stock_committed: false,
        is_gift: gift.is_gift,
        gift_wrapping: gift.is_gift ? gift.gift_wrapping : false,
        hide_invoice_price: gift.is_gift ? gift.hide_invoice_price : false,
        gift_message: gift.is_gift ? gift.gift_message.slice(0, GIFT_MSG_MAX) : '',
      });

      // Create the order line items, then IMMEDIATELY reserve stock. Reservation
      // is the atomic gate that holds inventory at placement so two customers
      // can't both take the last unit; a rejected reservation cancels the order
      // server-side, so we stop here without sending confirmations or clearing
      // the cart.
      await Promise.all(items.map(item =>
        base44.entities.OrderItem.create({
          order_id: order.id,
          product_id: item.product.id,
          product_name: item.product.name,
          sku: item.product.sku || '',
          size: item.variant?.size || '',
          color: item.variant?.color || '',
          quantity: item.quantity,
          unit_price_usd: item.price,
          line_total_usd: item.price * item.quantity,
        })
      ));

      const reservation = await reserveOrderStock(order.id);
      if (!reservation?.ok) {
        const names = (reservation?.shortages || []).map(s => s.name).filter(Boolean).join(', ');
        setStockError(
          names
            ? t(`Sorry, some items were just reserved by another customer or are out of stock: ${names}`,
                `عذراً، بعض المنتجات تم حجزها للتو من قبل عميل آخر أو نفدت من المخزون: ${names}`)
            : t('Sorry, this item was just reserved by another customer or is out of stock.',
                'عذراً، تم حجز هذا المنتج للتو من قبل عميل آخر أو نفد من المخزون.')
        );
        setSubmitting(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (customer && customer.free_delivery_credits_remaining > 0 && effectiveDelivery > 0 && subtotal < 50) {
        try {
          await base44.functions.invoke('membershipEngine', {
            action: 'consume_credit',
            customer_id: customer.id
          });
        } catch (e) {
          console.error('Credit consumption failed:', e);
        }
      }

      if (customer) {
        const newSpend = (customer.lifetime_spend_usd || 0) + grandTotal;
        await base44.entities.Customer.update(customer.id, {
          lifetime_spend_usd: newSpend,
          total_orders: (customer.total_orders || 0) + 1,
          total_spent_usd: (customer.total_spent_usd || 0) + grandTotal
        });

        try {
          await base44.functions.invoke('membershipEngine', {
            action: 'check_tier_upgrade',
            customer_id: customer.id
          });
        } catch (e) {
          console.error('Tier upgrade check failed:', e);
        }
      }
      if (promoCode) {
        await base44.entities.PromoCode.update(promoCode.id, { times_used: (promoCode.times_used || 0) + 1 });
      }

      if (currentUser?.id) {
        try {
          await base44.auth.updateMe({ preferred_payment: form.payment_method });
        } catch (_) { /* non-critical */ }
      }

      try {
        await base44.functions.invoke('sendOrderConfirmation', { order_id: order.id });
      } catch (e) {
        console.error('Order confirmation email failed:', e);
      }
      try {
        await base44.functions.invoke('sendOrderNotification', { order_id: order.id });
      } catch (e) {
        console.error('Order notification email failed:', e);
      }

      // Meta Purchase — browser pixel + server-side CAPI share one event_id so
      // Meta deduplicates the two. Both are best-effort and never block checkout.
      try {
        const metaEventId = newEventId();
        trackPurchase({ items, value: grandTotal, eventId: metaEventId });
        base44.functions.invoke('metaTrackPurchase', {
          order_id: order.id,
          event_id: metaEventId,
          event_source_url: window.location.href,
        }).catch(() => {});
      } catch (e) {
        console.error('Meta purchase tracking failed:', e);
      }

      clearCart();
      setSuccess(order.order_number);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <>
        <ScrollToTop trigger={success} />
        <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
          <CheckCircle2 className="w-14 h-14 text-success animate-in zoom-in duration-500" />
          <h2 className="font-display font-bold uppercase text-2xl tracking-tight">{t('Order placed', 'تم تقديم طلبك')}</h2>
          <p className="text-muted-foreground">{t('Your order number is', 'رقم طلبك هو')} <strong className="text-foreground text-lg font-display">{success}</strong></p>
          <p className="text-sm text-muted-foreground max-w-sm">{t('We’ll be in touch to confirm delivery. Track your order any time.', 'سنتواصل معك لتأكيد التوصيل. تتبّع طلبك في أي وقت.')}</p>
          <div className="flex gap-3 mt-2">
            <button onClick={() => navigate('/track')} className="btn-outline h-11 px-5">{t('Track order', 'تتبع الطلب')}</button>
            <button onClick={() => navigate('/shop')} className="btn-primary h-11 px-5">{t('Continue shopping', 'تابع التسوق')}</button>
          </div>
        </div>
      </>
    );
  }

  if (items.length === 0) {
    navigate('/cart', { replace: true });
    return null;
  }

  const inputCls = 'w-full px-3 h-11 rounded-sm border border-border bg-background text-sm outline-none focus:border-foreground transition-colors';

  return (
    <div className="min-h-screen bg-background">
      {currentUser && (
        <div className="bg-secondary border-b border-border px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="text-xs text-muted-foreground">{t('Signed in as', 'تم تسجيل الدخول باسم')}</span>
              <span className="font-display uppercase text-sm">{currentUser.full_name || currentUser.email}</span>
              {customer && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs font-display uppercase tracking-wide bg-charcoal text-white px-2 py-0.5 rounded-sm">
                    {customer.current_tier} {t('Member', 'العضو')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {memberDiscount > 0 && `• ${memberDiscount}% ${t('discount', 'خصم')}`}
                    {customer.free_delivery_credits_remaining > 0 && ` • ${customer.free_delivery_credits_remaining} ${t('free deliveries', 'توصيلات مجانية')}`}
                  </span>
                </>
              )}
            </div>
            <Link to="/account" className="text-xs text-foreground hover:underline shrink-0">{t('Edit profile', 'تعديل الملف')}</Link>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="font-display font-bold uppercase text-2xl sm:text-3xl tracking-tight mb-6">{t('Checkout', 'إتمام الطلب')}</h1>
        <div className="grid md:grid-cols-[1fr_340px] gap-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {stockError && (
              <div className="bg-sale/10 border border-sale/30 rounded-sm p-4 text-sale text-sm">{stockError}</div>
            )}

            <div className="border border-border rounded-sm p-5 space-y-3">
              <h2 className="font-display uppercase tracking-wide text-sm">{t('Contact', 'التواصل')}</h2>
              {[
                { k: 'customer_name', label: t('Full Name *', 'الاسم الكامل *'), required: true, autoComplete: 'name' },
                { k: 'customer_phone', label: t('Phone *', 'الهاتف *'), required: true, type: 'tel', inputMode: 'tel', autoComplete: 'tel' },
                { k: 'customer_email', label: t('Email *', 'البريد الإلكتروني *'), required: true, type: 'email', inputMode: 'email', autoComplete: 'email', readOnly: !!currentUser },
              ].map(({ k, label, required, type, inputMode, autoComplete, readOnly }) => (
                <div key={k}>
                  <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                  <input
                    required={required}
                    type={type || 'text'}
                    inputMode={inputMode}
                    autoComplete={autoComplete}
                    readOnly={readOnly}
                    value={form[k]}
                    onChange={e => { setF(k, e.target.value); if (k === 'customer_phone') setPhoneError(''); }}
                    className={`${inputCls} ${readOnly ? 'bg-secondary text-muted-foreground cursor-not-allowed' : ''}`}
                  />
                  {k === 'customer_email' && emailError && <p className="text-xs text-sale mt-1">{emailError}</p>}
                  {k === 'customer_phone' && phoneError && <p className="text-xs text-sale mt-1">{phoneError}</p>}
                </div>
              ))}

              {!currentUser && (
                <label className="flex items-center gap-2 cursor-pointer border-t border-border pt-3">
                  <input type="checkbox" checked={createAccount} onChange={(e) => setCreateAccount(e.target.checked)} className="rounded-sm" />
                  <span className="text-xs text-muted-foreground">{t('Create an account to track my orders', 'إنشاء حساب لتتبع طلباتي')}</span>
                </label>
              )}
            </div>

            <div className="border border-border rounded-sm p-5 space-y-3">
              <h2 className="font-display uppercase tracking-wide text-sm">{t('Delivery', 'التوصيل')}</h2>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t('Shipping Zone *', 'منطقة الشحن *')}</label>
                <select required value={form.shipping_zone_id} onChange={e => setF('shipping_zone_id', e.target.value)} className={inputCls}>
                  <option value="">-- {t('Select a zone', 'اختر منطقة')} --</option>
                  {shippingZones.map(z => (
                    <option key={z.id} value={z.id}>
                      {lang === 'ar' ? (z.area_name_ar || z.area_name) : z.area_name} {z.is_catchall ? t('(Other areas)', '(مناطق أخرى)') : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('Governorate', 'المحافظة')}</label>
                  <select value={form.city} onChange={e => setF('city', e.target.value)} className={inputCls}>
                    <option value="">--</option>
                    {CITIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t('District', 'المنطقة')}</label>
                  <input value={form.district} onChange={e => setF('district', e.target.value)} className={inputCls} placeholder={t('Optional', 'اختياري')} />
                </div>
              </div>
              {[
                { k: 'street', label: t('Street', 'الشارع'), autoComplete: 'address-line1' },
                { k: 'building', label: t('Building', 'البناية'), autoComplete: 'address-line2' },
                { k: 'floor', label: t('Floor (optional)', 'الطابق (اختياري)') },
                { k: 'landmark', label: t('Landmark (optional)', 'علامة مميزة (اختياري)') },
              ].map(({ k, label, autoComplete }) => (
                <div key={k}>
                  <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                  <input value={form[k]} onChange={e => setF(k, e.target.value)} autoComplete={autoComplete} className={inputCls} />
                </div>
              ))}
            </div>

            <div className="border border-border rounded-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display uppercase tracking-wide text-sm">{t('Payment', 'الدفع')}</h2>
                {currentUser?.preferred_payment && form.payment_method === currentUser.preferred_payment && (
                  <span className="text-xs text-muted-foreground">{t('Saved preference', 'محفوظة')}</span>
                )}
              </div>
              {enabledMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('No payment methods available.', 'لا توجد طرق دفع متاحة.')}</p>
              ) : (
                <div className="flex gap-3 flex-wrap">
                  {enabledMethods.map(m => (
                    <button type="button" key={m.key} onClick={() => setF('payment_method', m.key)}
                      className={`flex-1 h-11 rounded-sm border text-sm font-display transition-colors min-w-[120px]
                        ${form.payment_method === m.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-foreground'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-border rounded-sm p-5 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={gift.is_gift} onChange={e => setGiftField('is_gift', e.target.checked)} className="rounded-sm" />
                <span className="font-display uppercase tracking-wide text-sm flex items-center gap-1.5">
                  <Gift className="w-4 h-4" /> {t('This is a gift', 'هذا هدية')}
                </span>
              </label>

              {gift.is_gift && (
                <div className="space-y-3 border-l-2 border-border ml-1 pl-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={gift.gift_wrapping} onChange={e => setGiftField('gift_wrapping', e.target.checked)} className="rounded-sm" />
                    <span className="text-sm">{t('Add gift wrapping', 'أضف تغليف الهدية')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={gift.hide_invoice_price} onChange={e => setGiftField('hide_invoice_price', e.target.checked)} className="rounded-sm" />
                    <span className="text-sm">{t('Hide prices on the packing slip', 'إخفاء الأسعار في الإيصال')}</span>
                  </label>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">{t('Gift message (optional)', 'رسالة الهدية (اختياري)')}</label>
                    <textarea
                      value={gift.gift_message}
                      maxLength={GIFT_MSG_MAX}
                      onChange={e => setGiftField('gift_message', e.target.value.slice(0, GIFT_MSG_MAX))}
                      rows={3}
                      placeholder={t('Write a personal note to the recipient…', 'اكتب رسالة شخصية للمستلم…')}
                      className="w-full px-3 py-2.5 rounded-sm border border-border bg-background text-sm resize-none outline-none focus:border-foreground"
                    />
                    <p className="text-xs text-muted-foreground mt-1 text-right">{gift.gift_message.length}/{GIFT_MSG_MAX}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="border border-border rounded-sm p-5">
              <label className="text-xs text-muted-foreground block mb-1">{t('Order Notes (optional)', 'ملاحظات الطلب (اختياري)')}</label>
              <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={2}
                className="w-full px-3 py-2.5 rounded-sm border border-border bg-background text-sm resize-none outline-none focus:border-foreground" />
            </div>

            <button type="submit" disabled={submitting}
              className="btn-primary w-full h-13 flex items-center justify-center gap-2 disabled:opacity-50">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('Place order', 'تأكيد الطلب')} · ${grandTotal.toFixed(2)}
            </button>
          </form>

          {/* Order summary */}
          <div>
            <div className="border border-border rounded-sm p-5 space-y-3 sticky top-24">
              <h2 className="font-display uppercase tracking-wide text-sm">{t('Order Summary', 'ملخص الطلب')}</h2>
              {items.map((item, i) => {
                const name = lang === 'ar' ? (item.product.name_ar || item.product.name) : item.product.name;
                return (
                  <div key={i} className="flex justify-between text-sm gap-2">
                    <span className="text-muted-foreground line-clamp-1 flex-1">{name} ×{item.quantity}</span>
                    <span className="font-display font-semibold shrink-0 tabular-nums">${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                );
              })}

              <div className="pt-2 border-t border-border">
                {promoCode ? (
                  <div className="flex items-center gap-2 bg-success/10 border border-success/30 rounded-sm px-3 py-2">
                    <Tag className="w-4 h-4 text-success shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-display uppercase text-success">{promoCode.code} {t('applied', 'مُطبّق')}</p>
                      <p className="text-xs text-success">
                        {promoCode.type === 'free_shipping' ? t('Free shipping', 'شحن مجاني') : `-$${promoDiscount.toFixed(2)}`}
                      </p>
                    </div>
                    <button onClick={removePromo} className="text-success"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">{t('Promo Code', 'رمز ترويجي')}</label>
                    <div className="flex gap-2">
                      <input value={promoInput} onChange={e => setPromoInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleApplyPromo())}
                        placeholder={t('Enter code', 'أدخل الرمز')}
                        className="flex-1 px-3 h-10 rounded-sm border border-border bg-background text-sm outline-none focus:border-foreground" />
                      <button type="button" onClick={handleApplyPromo} disabled={!promoInput.trim() || promoLoading}
                        className="px-4 h-10 bg-primary text-primary-foreground rounded-sm text-xs font-display uppercase disabled:opacity-50 flex items-center gap-1">
                        {promoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : t('Apply', 'تطبيق')}
                      </button>
                    </div>
                    {promoError && <p className="text-xs text-sale">{promoError}</p>}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>{t('Subtotal', 'المجموع الفرعي')}</span><span className="tabular-nums">${subtotal.toFixed(2)}</span></div>

                {customer && memberDiscount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1"><Gift className="w-3 h-3" /> {customer.current_tier} ({memberDiscount}%)</span>
                    <span className="font-display font-semibold tabular-nums">-${effectiveMemberDiscount.toFixed(2)}</span>
                  </div>
                )}

                {effectivePromoDiscount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>{t('Promo', 'رمز')} ({promoCode?.code})</span>
                    <span className="tabular-nums">-${effectivePromoDiscount.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-muted-foreground">
                  <span>{t('Delivery', 'التوصيل')}</span>
                  <span className="tabular-nums">
                    {effectiveDelivery === 0 ? (
                      <span className="text-success">
                        {isFreeShipping ? `${t('Free', 'مجاني')} (${t('promo', 'رمز')})` : t('Free', 'مجاني')}
                      </span>
                    ) : (
                      `$${effectiveDelivery.toFixed(2)}`
                    )}
                  </span>
                </div>

                {!qualifiesForThreshold && !isFreeShipping && (
                  <div className="pt-2">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-muted-foreground">{t('Free shipping at', 'شحن مجاني عند')} ${freeShippingThreshold.toFixed(0)}</span>
                      <span className="text-xs font-display">${(freeShippingThreshold - postDiscountSubtotal).toFixed(2)} {t('away', 'متبقي')}</span>
                    </div>
                    <div className="w-full h-1.5 bg-secondary rounded-sm overflow-hidden">
                      <div className="h-full bg-primary transition-all duration-300" style={{ width: `${Math.min((postDiscountSubtotal / freeShippingThreshold) * 100, 100)}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex justify-between font-display font-bold text-base pt-1">
                  <span>{t('Total', 'المجموع')}</span>
                  <span className="tabular-nums">${grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
