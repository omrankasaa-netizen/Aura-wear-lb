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

  const { data: assets = [] } = useQuery({
    queryKey: ['media-instagram'],
    queryFn: () => base44.entities.MediaAsset.filter({ type: 'other', is_active: true }, '-created_date', 8),
    staleTime: 60_000,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['cms-section', 'home_instagram'],
    queryFn: () => base44.entities.CmsSection.filter({ section_key: 'home_instagram' }, 'sort_order', 1),
    staleTime: 60_000,
  });
  const section = sections[0];
  if (section && section.is_active === false) return null;

  const instagram = section?.link_url || settings.instagramUrl || BRAND.instagramUrl;
  const heading = (section && (lang === 'ar' ? (section.title_ar || section.title) : section.title)) || t('On the feed', 'على الإنستغرام');

  // Photos are manually curated in the CMS (Instagram tab) and stored as a JSON
  // array of image URLs in gallery_json. These do NOT sync from Instagram.
  // Fall back to legacy MediaAsset rows, then placeholders.
  let gallery = [];
  try { gallery = section?.gallery_json ? JSON.parse(section.gallery_json) : []; } catch { gallery = []; }
  const galleryUrls = (Array.isArray(gallery) ? gallery : []).filter(Boolean);
  const sourceUrls = galleryUrls.length
    ? galleryUrls
    : assets.slice(0, 6).map(a => a?.url).filter(Boolean);

  const tiles = [...sourceUrls.slice(0, 6)];
  while (tiles.length < 6) tiles.push(null);

  return (
    <section className="py-12 sm:py-16" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-7">
          <div>
            <p className="eyebrow text-muted-foreground mb-1">{t('Social', 'تابعنا')}</p>
            <h2 className="font-display font-bold uppercase text-2xl sm:text-3xl tracking-tight">{heading}</h2>
          </div>
          <a href={instagram} target="_blank" rel="noopener" className="eyebrow flex items-center gap-2 hover:text-muted-foreground">
            <Instagram className="w-4 h-4" /> @{BRAND.instagramHandle}
          </a>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          {tiles.map((url, i) => (
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
              {url ? (
                <img src={url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
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
