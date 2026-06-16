import React from 'react';
import { useLang } from '@/contexts/LanguageContext';
import { Truck, Banknote, ShieldCheck, MessageCircle } from 'lucide-react';

export default function TrustStrip() {
  const { t } = useLang();

  const items = [
    { icon: Truck, en: 'Delivered all over Lebanon', ar: 'توصيل لكل لبنان' },
    { icon: Banknote, en: 'Cash on delivery', ar: 'الدفع عند الاستلام' },
    { icon: ShieldCheck, en: 'Secure checkout', ar: 'دفع آمن' },
    { icon: MessageCircle, en: 'WhatsApp support', ar: 'دعم عبر واتساب' },
  ];

  return (
    <section className="border-y border-border bg-secondary/40">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {items.map(({ icon: Icon, en, ar }) => (
            <div key={en} className="flex items-center gap-2.5 justify-center sm:justify-start">
              <Icon className="w-5 h-5 shrink-0" strokeWidth={1.5} />
              <span className="text-xs sm:text-sm font-medium leading-tight">{t(en, ar)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
