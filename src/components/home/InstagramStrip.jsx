import React from 'react';
import { motion } from 'framer-motion';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { Instagram } from 'lucide-react';
import { BRAND } from '@/lib/brand';

export default function InstagramStrip() {
  const { t, lang } = useLang();
  const settings = useSiteSettings();
  const instagram = settings.instagramUrl || BRAND.instagramUrl;

  const { data: assets = [] } = useQuery({
    queryKey: ['media-instagram'],
    queryFn: () => base44.entities.MediaAsset.filter({ type: 'other', is_active: true }, '-created_date', 8),
    staleTime: 60_000,
  });

  const tiles = [...assets.slice(0, 6)];
  while (tiles.length < 6) tiles.push(null);

  return (
    <section className="py-12 sm:py-16" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-7">
          <div>
            <p className="eyebrow text-muted-foreground mb-1">{t('Social', 'تابعنا')}</p>
            <h2 className="font-display font-bold uppercase text-2xl sm:text-3xl tracking-tight">{t('On the feed', 'على الإنستغرام')}</h2>
          </div>
          <a href={instagram} target="_blank" rel="noopener" className="eyebrow flex items-center gap-2 hover:text-muted-foreground">
            <Instagram className="w-4 h-4" /> @{BRAND.instagramHandle}
          </a>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {tiles.map((asset, i) => (
            <motion.a
              key={i}
              href={instagram}
              target="_blank"
              rel="noopener"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
              className="aspect-square overflow-hidden bg-secondary group rounded-sm"
            >
              {asset?.url ? (
                <img src={asset.url} alt={asset.name || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Instagram className="w-5 h-5 text-muted-foreground/30" /></div>
              )}
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}
