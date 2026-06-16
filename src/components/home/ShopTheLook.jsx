import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';

export default function ShopTheLook() {
  const { t } = useLang();

  return (
    <section className="py-12 sm:py-16">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Editorial look block */}
          <Link to="/shop?category=matching-sets" className="group relative block aspect-[4/5] sm:aspect-square overflow-hidden bg-navy rounded-sm">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-0 left-0 p-6 sm:p-8">
              <p className="eyebrow text-white/70 mb-2">{t('Shop the look', 'تسوّق الإطلالة')}</p>
              <h3 className="font-display font-bold uppercase text-white text-2xl sm:text-3xl leading-tight mb-3">{t('Build your fit', 'كوّن إطلالتك')}</h3>
              <span className="inline-flex items-center justify-center bg-white text-charcoal font-display uppercase tracking-[0.12em] text-xs font-semibold px-6 h-11 rounded-sm group-hover:bg-white/90 transition-colors">{t('Shop sets', 'تسوّق الأطقم')}</span>
            </div>
          </Link>

          {/* Style-led discovery tiles */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { en: 'Everyday Essentials', ar: 'الأساسيات اليومية', to: '/shop?category=t-shirts' },
              { en: 'Weekend Fit', ar: 'إطلالة الويكند', to: '/shop?category=polos' },
              { en: 'Clean Basics', ar: 'أساسيات نظيفة', to: '/shop?category=jeans' },
              { en: 'New Drops', ar: 'وصل حديثاً', to: '/shop?category=new-arrivals' },
            ].map((tile) => (
              <Link key={tile.en} to={tile.to} className="group relative block aspect-square overflow-hidden bg-secondary rounded-sm">
                <div className="absolute inset-0 flex items-center justify-center">
                  <img src="/brand/aura-mark.png" alt="" className="w-8 h-8 opacity-15 group-hover:opacity-25 transition-opacity" />
                </div>
                <span className="absolute bottom-3 left-3 right-3 font-display uppercase tracking-wide text-xs sm:text-sm">{t(tile.en, tile.ar)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
