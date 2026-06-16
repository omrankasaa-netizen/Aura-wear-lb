import React, { useEffect, useRef, useState } from 'react';
import { useCart } from '@/contexts/CartContext';
import { useLang } from '@/contexts/LanguageContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { X, Minus, Plus, ShoppingBag, MessageCircle, Tag } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { BRAND, whatsappLink } from '@/lib/brand';

export default function CartDrawer() {
  const { isOpen, setIsOpen, items, updateQty, removeItem, subtotal: total, totalQty: count, addItem } = useCart();
  const { t, lang } = useLang();
  const settings = useSiteSettings();
  const threshold = settings.freeShippingThreshold || 50;
  const whatsapp = settings.whatsappNumber || BRAND.whatsappNumber;
  const contentRef = useRef(null);
  const [justAdded, setJustAdded] = useState(null);
  const [promo, setPromo] = useState('');

  const remaining = Math.max(0, threshold - total);
  const progress = Math.min(100, (total / threshold) * 100);

  useEffect(() => {
    if (isOpen && contentRef.current) contentRef.current.scrollTop = 0;
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  const { data: recommendations = [] } = useQuery({
    queryKey: ['cart-recommendations', items.map(i => i.product.category_id).filter(Boolean)],
    queryFn: async () => {
      if (items.length === 0) return [];
      const catIds = [...new Set(items.map(i => i.product.category_id).filter(Boolean))];
      const recIds = new Set(items.map(i => i.product.id));
      const results = await base44.entities.Product.filter({ status: 'Active' }, '-is_featured', 50);
      return results
        .filter(p => !recIds.has(p.id) && (catIds.includes(p.category_id) || p.is_featured || p.is_new))
        .filter(p => (p.stock_quantity || 0) > 0 || p.has_variants)
        .slice(0, 6);
    },
    enabled: isOpen && items.length > 0,
  });

  const { data: allImages = [] } = useQuery({
    queryKey: ['cart-rec-images'],
    queryFn: () => base44.entities.ProductImage.list('-created_date', 500),
    enabled: recommendations.length > 0,
  });

  const imageMap = {};
  allImages.forEach(img => {
    if (!imageMap[img.product_id]) imageMap[img.product_id] = [];
    imageMap[img.product_id].push(img);
  });
  const getPrimaryImage = (productId) => {
    const imgs = imageMap[productId] || [];
    return imgs.find(i => i.is_primary)?.url || imgs[0]?.url || null;
  };

  const handleAddRecommendation = (product) => {
    setJustAdded(product.id);
    addItem(
      {
        id: product.id, name: product.name, name_ar: product.name_ar,
        price_usd: product.price_usd, compare_at_price_usd: product.compare_at_price_usd,
        image_url: product.image_url, sku: product.sku, primaryImage: getPrimaryImage(product.id),
        category_id: product.category_id, has_variants: product.has_variants,
      },
      null,
      1,
    );
    setTimeout(() => setJustAdded(null), 1500);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200" onClick={() => setIsOpen(false)} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-background z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-border">
          <h2 className="font-display uppercase tracking-wide text-base flex items-center gap-2">
            {t('Your Bag', 'سلتك')} {count > 0 && <span className="text-sm text-muted-foreground font-sans normal-case">({count})</span>}
          </h2>
          <button onClick={() => setIsOpen(false)} className="w-10 h-10 flex items-center justify-center -mr-2 hover:bg-secondary/60 rounded-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free shipping progress */}
        {items.length > 0 && (
          <div className="px-5 py-3 bg-secondary/50 border-b border-border">
            {remaining === 0 ? (
              <p className="text-xs font-medium text-success">{t('You unlocked free delivery.', 'حصلت على توصيل مجاني.')}</p>
            ) : (
              <p className="text-xs text-muted-foreground mb-1.5">
                {t(`$${remaining.toFixed(2)} away from free delivery`, `على بُعد $${remaining.toFixed(2)} من التوصيل المجاني`)}
              </p>
            )}
            <div className="h-1 bg-stone/60 overflow-hidden mt-1.5">
              <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Items */}
        <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {items.length === 0 && (
            <div className="text-center py-20 flex flex-col items-center gap-4">
              <img src="/brand/aura-mark.png" alt="" className="w-12 h-12 opacity-30" />
              <div>
                <p className="font-display uppercase tracking-wide text-sm">{t("Your bag's empty.", 'سلتك فارغة.')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('Time to build the fit.', 'وقت تبني الإطلالة.')}</p>
              </div>
              <Link to="/shop" onClick={() => setIsOpen(false)} className="btn-primary mt-2">{t('Shop New Arrivals', 'تسوّق الجديد')}</Link>
            </div>
          )}

          {items.map(item => (
            <div key={item.key}
              className={`flex gap-3 pb-4 border-b border-border/60 transition-colors ${justAdded === item.product.id ? 'bg-secondary/40' : ''}`}>
              <div className="w-20 h-24 overflow-hidden shrink-0 bg-secondary flex items-center justify-center rounded-sm">
                {(item.product.primaryImage || item.product.image_url)
                  ? <img src={item.product.primaryImage || item.product.image_url} alt="" className="w-full h-full object-cover" />
                  : <ShoppingBag className="w-5 h-5 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex justify-between gap-2">
                  <p className="text-sm font-medium line-clamp-2">{lang === 'ar' ? (item.product.name_ar || item.product.name) : item.product.name}</p>
                  <button onClick={() => removeItem(item.key)} className="text-muted-foreground hover:text-sale shrink-0"><X className="w-4 h-4" /></button>
                </div>
                {item.variant && <p className="text-xs text-muted-foreground mt-0.5">{[item.variant.size, item.variant.color].filter(Boolean).join(' · ')}</p>}
                <div className="flex items-center justify-between mt-auto pt-2">
                  <div className="flex items-center border border-border rounded-sm">
                    <button onClick={() => updateQty(item.key, Math.max(1, (item.quantity || 1) - 1))} className="w-8 h-8 flex items-center justify-center hover:bg-secondary/60"><Minus className="w-3 h-3" /></button>
                    <span className="text-sm font-medium w-7 text-center tabular-nums">{item.quantity}</span>
                    <button onClick={() => updateQty(item.key, (item.quantity || 1) + 1)} className="w-8 h-8 flex items-center justify-center hover:bg-secondary/60"><Plus className="w-3 h-3" /></button>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">${((parseFloat(item.price) || 0) * (item.quantity || 0)).toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}

          {/* Add-on strip */}
          {items.length > 0 && recommendations.length > 0 && (
            <div className="pt-2">
              <p className="eyebrow text-muted-foreground mb-3">{t('Complete the fit', 'كمّل الإطلالة')}</p>
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {recommendations.map(product => {
                  const img = getPrimaryImage(product.id);
                  const name = lang === 'ar' ? (product.name_ar || product.name) : product.name;
                  return (
                    <div key={product.id} className="shrink-0 w-28 border border-border rounded-sm overflow-hidden">
                      <div className="aspect-[4/5] bg-secondary overflow-hidden flex items-center justify-center">
                        {(img || product.image_url) ? <img src={img || product.image_url} alt={name} className="w-full h-full object-cover" /> : <ShoppingBag className="w-5 h-5 text-muted-foreground" />}
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-medium line-clamp-1">{name}</p>
                        <p className="text-xs font-semibold tabular-nums mb-1.5">${(parseFloat(product.price_usd) || 0).toFixed(2)}</p>
                        <button onClick={() => handleAddRecommendation(product)} className="w-full text-[11px] uppercase tracking-wide font-display py-1.5 border border-primary hover:bg-primary hover:text-primary-foreground transition-colors rounded-sm">{t('Add', 'أضف')}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-border px-5 py-4 space-y-3">
            {/* Promo */}
            <div className="flex items-center border border-border rounded-sm">
              <Tag className="w-4 h-4 text-muted-foreground ml-3" />
              <input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder={t('Promo code', 'كود الخصم')}
                className="flex-1 bg-transparent px-2 h-10 text-sm focus:outline-none placeholder:text-muted-foreground uppercase" />
              <button className="text-xs uppercase tracking-wide font-display px-4 h-10 text-muted-foreground hover:text-foreground">{t('Apply', 'تطبيق')}</button>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('Subtotal', 'المجموع الفرعي')}</span>
              <span className="font-semibold tabular-nums">${total.toFixed(2)}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('Cash on delivery · Shipping calculated at checkout.', 'الدفع عند الاستلام · يُحتسب الشحن عند الدفع.')}</p>
            <Link to="/checkout" onClick={() => setIsOpen(false)} className="btn-primary w-full">{t('Checkout', 'إتمام الطلب')}</Link>
            <div className="flex items-center gap-3">
              <Link to="/cart" onClick={() => setIsOpen(false)} className="btn-outline flex-1 h-11">{t('View Bag', 'عرض السلة')}</Link>
              <a href={whatsappLink(t('Hi AURA, I need help with my order.', 'مرحباً AURA، بدي مساعدة بطلبي.'), whatsapp)} target="_blank" rel="noopener"
                className="h-11 px-4 border border-border rounded-sm flex items-center justify-center gap-2 text-xs uppercase tracking-wide font-display hover:bg-secondary/60">
                <MessageCircle className="w-4 h-4" /> {t('Help', 'مساعدة')}
              </a>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
