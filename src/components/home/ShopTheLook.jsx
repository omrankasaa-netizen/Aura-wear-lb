import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { cmsImageSrc } from '@/lib/imageFraming';

// Default feature panel + category tiles. Used as a graceful fallback before any
// CMS content exists (e.g. first load pre-seed) so the section never disappears.
const DEFAULT_FEATURE = {
  overline: 'Shop the look', overline_ar: 'تسوّق الإطلالة',
  title: 'Build your fit', title_ar: 'كوّن إطلالتك',
  button_label: 'Shop sets', button_label_ar: 'تسوّق الأطقم',
  image_url: '/brand/aura-shopthelook.jpg',
  link_url: '/shop?category=matching-sets',
};
const DEFAULT_TILES = [
  { title: 'Everyday Essentials', title_ar: 'الأساسيات اليومية', link: '/shop?category=t-shirts', image_url: '' },
  { title: 'Weekend Fit', title_ar: 'إطلالة الويكند', link: '/shop?category=polos', image_url: '' },
  { title: 'Clean Basics', title_ar: 'أساسيات نظيفة', link: '/shop?category=jeans', image_url: '' },
  { title: 'New Drops', title_ar: 'وصل حديثاً', link: '/shop?category=new-arrivals', image_url: '' },
];

export default function ShopTheLook() {
  const { lang } = useLang();

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'home_shop_the_look'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'home_shop_the_look' }, 'sort_order', 1),
    staleTime: 60_000,
  });
  const section = sections[0];

  // Toggle off -> hide. No row yet -> render defaults (graceful pre-seed fallback).
  if (section && section.is_active === false) return null;

  const feature = section || DEFAULT_FEATURE;
  let tiles = DEFAULT_TILES;
  if (section) {
    try {
      const parsed = section.tiles_json ? JSON.parse(section.tiles_json) : [];
      if (Array.isArray(parsed)) tiles = parsed;
    } catch { tiles = []; }
  }

  const pick = (en, ar) => (lang === 'ar' ? (ar || en) : en) || '';
  const overline = pick(feature.overline, feature.overline_ar);
  const headline = pick(feature.title, feature.title_ar);
  const buttonLabel = pick(feature.button_label, feature.button_label_ar);
  const featureLink = feature.link_url || '/shop';
  const featureImg = feature.image_url || DEFAULT_FEATURE.image_url;

  return (
    <section className="py-12 sm:py-16">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Editorial look block */}
          <Link to={featureLink} className="group relative block aspect-[4/5] sm:aspect-square overflow-hidden bg-navy rounded-sm">
            {featureImg && <img src={cmsImageSrc(featureImg, 'large')} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-0 left-0 p-6 sm:p-8">
              {overline && <p className="eyebrow text-white/70 mb-2">{overline}</p>}
              {headline && <h3 className="font-display font-bold uppercase text-white text-2xl sm:text-3xl leading-tight mb-3">{headline}</h3>}
              {buttonLabel && <span className="inline-flex items-center justify-center bg-white text-charcoal font-display uppercase tracking-[0.12em] text-xs font-semibold px-6 h-11 rounded-sm group-hover:bg-white/90 transition-colors">{buttonLabel}</span>}
            </div>
          </Link>

          {/* Style-led discovery tiles */}
          <div className="grid grid-cols-2 gap-4">
            {tiles.map((tile, i) => (
              <Link key={i} to={tile.link || '/shop'} className="group relative block aspect-square overflow-hidden bg-secondary rounded-sm">
                {tile.image_url ? (
                  <>
                    <img src={cmsImageSrc(tile.image_url, 'card')} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img src="/brand/aura-mark.png" alt="" className="w-8 h-8 opacity-15 group-hover:opacity-25 transition-opacity" />
                  </div>
                )}
                <span className={`absolute bottom-3 left-3 right-3 font-display uppercase tracking-wide text-xs sm:text-sm ${tile.image_url ? 'text-white' : ''}`}>{pick(tile.title, tile.title_ar)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
