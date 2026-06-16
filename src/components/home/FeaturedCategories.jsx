import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { COLLECTIONS } from '@/lib/brand';

export default function FeaturedCategories() {
  const { t, lang } = useLang();

  const { data: categories = [] } = useQuery({
    queryKey: ['categories-active'],
    queryFn: () => base44.entities.Category.filter({ is_active: true }, 'sort_order', 20),
    staleTime: 60_000,
  });

  // Fall back to static AURA collections so the section is intentional pre-catalog.
  const tiles = categories.length
    ? categories.map((c) => ({ slug: c.slug, name: lang === 'ar' ? (c.name_ar || c.name) : c.name, image: c.image_url }))
    : COLLECTIONS.map((c) => ({ slug: c.slug, name: c.label, image: null }));

  return (
    <section className="py-12 sm:py-16">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between mb-7">
          <div>
            <p className="eyebrow text-muted-foreground mb-2">{t('Collections', 'المجموعات')}</p>
            <h2 className="font-display font-bold uppercase text-2xl sm:text-3xl tracking-tight">{t('Shop the range', 'تسوّق التشكيلة')}</h2>
          </div>
          <Link to="/shop" className="eyebrow text-foreground hover:text-muted-foreground hidden sm:block">{t('View all', 'عرض الكل')}</Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {tiles.map((c, i) => (
            <motion.div key={c.slug} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.05 }}>
              <Link to={`/shop?category=${c.slug}`} className="group relative block aspect-square overflow-hidden bg-secondary rounded-sm">
                {c.image ? (
                  <img src={c.image} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img src="/brand/aura-mark.png" alt="" className="w-10 h-10 opacity-15" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <span className="absolute bottom-3 left-3 font-display uppercase tracking-wide text-sm text-white">{c.name}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
