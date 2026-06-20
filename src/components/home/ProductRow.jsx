import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import ProductCard from '@/components/storefront/ProductCard';
import { ChevronRight, ChevronLeft } from 'lucide-react';

export default function ProductRow({ title, titleAr, filter, viewAllLink }) {
  const { t, lang } = useLang();
  const scrollRef = useRef(null);

  const { data: rawProducts = [] } = useQuery({
    queryKey: ['home-products', JSON.stringify(filter)],
    queryFn: () => base44.entities.Product.filter(filter, '-created_date', 12),
    staleTime: 60_000,
  });

  const { data: allImages = [] } = useQuery({
    queryKey: ['product-images-home', rawProducts.map(p => p.id).join(',')],
    queryFn: async () => {
      if (rawProducts.length === 0) return [];
      return base44.entities.ProductImage.list('sort_order', 500);
    },
    enabled: rawProducts.length > 0,
    staleTime: 60_000,
  });

  const imgMap = {};
  const cardImagesMap = {};
  for (const img of allImages) {
    (cardImagesMap[img.product_id] ||= []).push(img);
    if (!imgMap[img.product_id] || img.is_primary) imgMap[img.product_id] = img.url;
  }
  for (const id of Object.keys(cardImagesMap)) {
    cardImagesMap[id] = cardImagesMap[id]
      .slice()
      .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.sort_order || 0) - (b.sort_order || 0))
      .map(img => ({ url: img.url, focal: img.focal, crop: img.crop, alt: img.alt }));
  }

  const products = rawProducts.map(p => ({ ...p, primaryImage: imgMap[p.id] || null, cardImages: cardImagesMap[p.id] || [] }));

  if (products.length === 0) return null;

  function scroll(dir) {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: dir * 260, behavior: 'smooth' });
  }

  const heading = lang === 'ar' ? titleAr : title;

  return (
    <section className="py-12 sm:py-16" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between mb-7">
          <h2 className="font-display font-bold uppercase text-2xl sm:text-3xl tracking-tight">{heading}</h2>
          <div className="flex items-center gap-3">
            <Link to={viewAllLink} className="eyebrow text-foreground hover:text-muted-foreground">{t('View all', 'عرض الكل')}</Link>
            <div className="hidden sm:flex gap-1.5">
              <button onClick={() => scroll(-1)} className="w-9 h-9 border border-border flex items-center justify-center hover:bg-secondary/60 rounded-sm"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => scroll(1)} className="w-9 h-9 border border-border flex items-center justify-center hover:bg-secondary/60 rounded-sm"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        <div className="hidden lg:grid grid-cols-4 gap-5">
          {products.slice(0, 8).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
        <div ref={scrollRef} className="lg:hidden flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory no-scrollbar">
          {products.map(p => (
            <div key={p.id} className="snap-start shrink-0 w-[44%] sm:w-[30%]">
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}