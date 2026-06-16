import React from 'react';
import { useCart } from '@/contexts/CartContext';
import { useLang } from '@/contexts/LanguageContext';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, Plus, Minus, ArrowRight } from 'lucide-react';

export default function CartPage() {
  const { items, removeItem, updateQty, subtotal } = useCart();
  const { t, lang } = useLang();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-5 px-4 text-center">
        <img src="/brand/aura-mark.png" alt="" className="w-12 h-12 opacity-25" />
        <div>
          <p className="font-display uppercase tracking-wide">{t('Your bag’s empty.', 'سلتك فارغة.')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('Time to build the fit.', 'حان وقت تكوين الإطلالة.')}</p>
        </div>
        <Link to="/shop" className="btn-primary h-12 px-8">{t('Shop now', 'تسوّق الآن')}</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="font-display font-bold uppercase text-2xl sm:text-3xl tracking-tight mb-6">{t('Your Bag', 'سلتك')}</h1>
        <div className="divide-y divide-border border-y border-border mb-6">
          {items.map((item) => {
            const name = lang === 'ar' ? (item.product.name_ar || item.product.name) : item.product.name;
            const linePrice = (parseFloat(item.price) || 0) * item.quantity;
            return (
              <div key={item.key} className="py-4 flex items-center gap-4">
                <div className="w-20 h-24 bg-secondary rounded-sm overflow-hidden shrink-0">
                  {item.product.primaryImage ? (
                    <img src={item.product.primaryImage} alt={name} className="w-full h-full object-cover" />
                  ) : <div className="w-full h-full flex items-center justify-center"><img src="/brand/aura-mark.png" alt="" className="w-6 h-6 opacity-20" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display uppercase text-sm tracking-wide line-clamp-1">{name}</p>
                  {(item.variant?.size || item.variant?.color) && (
                    <p className="text-xs text-muted-foreground mt-0.5">{[item.variant.size, item.variant.color].filter(Boolean).join(' / ')}</p>
                  )}
                  <p className="text-sm font-display font-semibold mt-1">${linePrice.toFixed(2)}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="inline-flex items-center border border-border rounded-sm">
                      <button onClick={() => updateQty(item.key, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center hover:bg-secondary"><Minus className="w-3 h-3" /></button>
                      <span className="w-8 text-center text-sm tabular-nums">{item.quantity}</span>
                      <button onClick={() => updateQty(item.key, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center hover:bg-secondary"><Plus className="w-3 h-3" /></button>
                    </div>
                    <button onClick={() => removeItem(item.key)} className="text-muted-foreground hover:text-sale flex items-center gap-1 text-xs">
                      <Trash2 className="w-3.5 h-3.5" /> {t('Remove', 'إزالة')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border border-border rounded-sm p-5">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-muted-foreground">{t('Subtotal', 'المجموع الفرعي')}</span>
            <span className="font-display font-semibold tabular-nums">${subtotal.toFixed(2)}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{t('Shipping calculated at checkout.', 'يُحسب الشحن عند الدفع.')}</p>
          <button onClick={() => navigate('/checkout')} className="btn-primary w-full h-13 flex items-center justify-center gap-2">
            {t('Checkout', 'إتمام الطلب')} <ArrowRight className="w-4 h-4" />
          </button>
          <Link to="/shop" className="block text-center text-xs text-muted-foreground hover:text-foreground mt-3">{t('Continue shopping', 'تابع التسوق')}</Link>
        </div>
      </div>
    </div>
  );
}
