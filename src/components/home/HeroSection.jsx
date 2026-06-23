import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { BRAND } from '@/lib/brand';
import { cmsImageSrc } from '@/lib/imageFraming';

export default function HeroSection() {
  const { lang, t } = useLang();

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'home_hero'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'home_hero' }, 'sort_order', 1),
    staleTime: 60_000,
  });
  const section = sections[0];

  const title = section ? (lang === 'ar' ? (section.title_ar || section.title) : section.title) : t('LEVEL UP YOUR AURA', 'ارفع مستوى حضورك');
  const body = section ? (lang === 'ar' ? (section.body_ar || section.body) : section.body) : t('Clean fits. Limited drops. Delivered across Lebanon.', 'قصّات نظيفة. دروبات محدودة. توصيل لكل لبنان.');
  const imgUrl = section?.image_url || null;
  const linkUrl = section?.link_url || '/shop?category=new-arrivals';

  return (
    <section className="relative overflow-hidden bg-secondary">
      <div className="relative aspect-[4/5] sm:aspect-[16/10] lg:aspect-[16/7] w-full">
        {imgUrl ? (
          <img src={cmsImageSrc(imgUrl, 'large')} alt="" loading="eager" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-secondary via-stone to-secondary" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />

        <div className="relative h-full max-w-[1280px] mx-auto px-5 sm:px-8 flex flex-col justify-end pb-10 sm:pb-14 lg:pb-16">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="max-w-2xl"
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
          >
            <p className="eyebrow text-white/80 mb-3">{BRAND.name} · {t('Men’s Apparel', 'أزياء رجالية')}</p>
            <h1 className="font-display font-bold uppercase text-white leading-[0.95] tracking-tight text-[34px] sm:text-5xl lg:text-6xl mb-4">
              {title}
            </h1>
            <p className="text-white/85 text-sm sm:text-base max-w-md mb-7">{body}</p>
            <div className="flex flex-wrap gap-3">
              <Link to={linkUrl} className="inline-flex items-center justify-center bg-white text-charcoal font-display uppercase tracking-[0.12em] text-xs font-semibold px-7 h-12 rounded-sm hover:bg-white/90 transition-colors">
                {t('Shop New Arrivals', 'تسوّق الجديد')}
              </Link>
              <Link to="/shop?category=offers" className="inline-flex items-center justify-center border border-white/70 text-white font-display uppercase tracking-[0.12em] text-xs font-semibold px-7 h-12 rounded-sm hover:bg-white hover:text-charcoal transition-colors">
                {t('Explore Offers', 'اكتشف العروض')}
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
