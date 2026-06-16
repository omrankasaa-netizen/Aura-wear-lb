import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';

export default function OfferBanner() {
  const { t } = useLang();

  return (
    <section className="py-4 sm:py-8">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
        <div className="relative overflow-hidden bg-charcoal text-white rounded-sm">
          <div className="relative px-6 sm:px-12 py-12 sm:py-16 text-center">
            <p className="eyebrow text-white/60 mb-3">{t('Limited drop', 'دروب محدود')}</p>
            <h2 className="font-display font-bold uppercase text-3xl sm:text-5xl tracking-tight leading-none mb-4">
              {t('Up to 40% off', 'خصم حتى 40%')}
            </h2>
            <p className="text-white/70 text-sm max-w-md mx-auto mb-7">{t('Selected fits, while they last. Limited quantities.', 'قطع مختارة، طالما توفّرت. كميات محدودة.')}</p>
            <Link to="/shop?category=offers" className="inline-flex items-center justify-center bg-white text-charcoal font-display uppercase tracking-[0.12em] text-xs font-semibold px-8 h-12 rounded-sm hover:bg-white/90 transition-colors">
              {t('Shop offers', 'تسوّق العروض')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
