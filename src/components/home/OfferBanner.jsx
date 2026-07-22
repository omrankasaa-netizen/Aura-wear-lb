import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { cmsImageSrc, handleImageError } from '@/lib/imageFraming';

// Default promo banner copy. Used as a graceful fallback before any CMS content
// exists (e.g. first load pre-seed) so the banner never disappears.
const DEFAULT_OFFER = {
  overline: 'Limited drop', overline_ar: 'دروب محدود',
  title: 'Up to 40% off', title_ar: 'خصم حتى 40%',
  body: 'Selected fits, while they last. Limited quantities.', body_ar: 'قطع مختارة، طالما توفّرت. كميات محدودة.',
  button_label: 'Shop offers', button_label_ar: 'تسوّق العروض',
  image_url: '/brand/aura-offer.jpg',
  link_url: '/shop?category=offers',
};

export default function OfferBanner() {
  const { lang } = useLang();

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'home_offer_banner'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'home_offer_banner' }, 'sort_order', 1),
    staleTime: 60_000,
  });
  const section = sections[0];

  // Toggle off -> hide. No row yet -> render defaults (graceful pre-seed fallback).
  if (section && section.is_active === false) return null;

  const s = section || DEFAULT_OFFER;
  const pick = (en, ar) => (lang === 'ar' ? (ar || en) : en) || '';
  const overline = pick(s.overline, s.overline_ar);
  const title = pick(s.title, s.title_ar);
  const body = pick(s.body, s.body_ar);
  const buttonLabel = pick(s.button_label, s.button_label_ar);
  const linkUrl = s.link_url || '/shop';
  const imageUrl = s.image_url || DEFAULT_OFFER.image_url;

  return (
    <section className="py-4 sm:py-8">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
        <div className="relative overflow-hidden bg-charcoal text-white rounded-sm">
          {imageUrl && <img src={cmsImageSrc(imageUrl, 'large')} alt="" loading="lazy" decoding="async" onError={handleImageError} className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-charcoal/65" />
          <div className="relative px-6 sm:px-12 py-12 sm:py-16 text-center">
            {overline && <p className="eyebrow text-white/60 mb-3">{overline}</p>}
            {title && (
              <h2 className="font-display font-bold uppercase text-3xl sm:text-5xl tracking-tight leading-none mb-4">
                {title}
              </h2>
            )}
            {body && <p className="text-white/70 text-sm max-w-md mx-auto mb-7">{body}</p>}
            {buttonLabel && (
              <Link to={linkUrl} className="inline-flex items-center justify-center bg-white text-charcoal font-display uppercase tracking-[0.12em] text-xs font-semibold px-8 h-12 rounded-sm hover:bg-white/90 transition-colors">
                {buttonLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
