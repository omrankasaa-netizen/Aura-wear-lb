import React, { useState } from 'react';
import { useLang } from '@/contexts/LanguageContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Gift, Filter } from 'lucide-react';
import ProductCard from '@/components/storefront/ProductCard';

const GIFT_CATEGORIES = [
  { slug: 'for-her', name: 'For Her', nameAr: 'لها', gender: 'Women' },
  { slug: 'for-him', name: 'For Him', nameAr: 'له', gender: 'Men' },
  { slug: 'unisex-picks', name: 'Unisex Picks', nameAr: 'للجنسين', gender: 'Unisex' },
  { slug: 'teens', name: 'Teens', nameAr: 'المراهقون', ageGroup: 'Teens' },
  { slug: 'under-25', name: 'Under $25', nameAr: 'أقل من 25 دولار', priceMax: 25 },
  { slug: 'under-50', name: 'Under $50', nameAr: 'أقل من 50 دولار', priceMax: 50 },
  { slug: 'luxury-picks', name: 'Luxury Picks', nameAr: 'الاختيارات الفاخرة', priceMin: 100 },
  { slug: 'best-sellers', name: 'Best Sellers', nameAr: 'الأكثر مبيعاً', featured: true },
];

export default function GiftGuidePage() {
  const { t, lang } = useLang();
  const [selected, setSelected] = useState('for-her');

  const { data: rawProducts = [] } = useQuery({
    queryKey: ['gift-guide-products'],
    queryFn: () => base44.entities.Product.filter({ status: 'Active' }, '-created_date', 500),
  });
  const { data: images = [] } = useQuery({
    queryKey: ['gift-guide-images'],
    queryFn: () => base44.entities.ProductImage.list('sort_order', 3000),
    enabled: rawProducts.length > 0, staleTime: 60_000,
  });

  const cardImagesMap = {};
  const imgMap = {};
  for (const img of images) {
    if (!imgMap[img.product_id] || img.is_primary) imgMap[img.product_id] = img.url;
    (cardImagesMap[img.product_id] ||= []).push(img);
  }
  for (const id of Object.keys(cardImagesMap)) {
    cardImagesMap[id] = cardImagesMap[id]
      .slice()
      .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.sort_order || 0) - (b.sort_order || 0))
      .map(img => ({ url: img.url, focal: img.focal, crop: img.crop, alt: img.alt, color: img.color || '' }));
  }
  const products = rawProducts.map(p => ({ ...p, primaryImage: imgMap[p.id] || null, cardImages: cardImagesMap[p.id] || [] }));

  const selectedCat = GIFT_CATEGORIES.find(c => c.slug === selected);

  let filtered = products;
  if (selectedCat?.gender) {
    filtered = filtered.filter(p => p.gender === selectedCat.gender);
  }
  if (selectedCat?.ageGroup) {
    filtered = filtered.filter(p => p.age_group === selectedCat.ageGroup);
  }
  if (selectedCat?.priceMax) {
    filtered = filtered.filter(p => p.price_usd <= selectedCat.priceMax);
  }
  if (selectedCat?.priceMin) {
    filtered = filtered.filter(p => p.price_usd >= selectedCat.priceMin);
  }
  if (selectedCat?.featured) {
    filtered = filtered.filter(p => p.is_featured);
  }

  const catName = lang === 'ar' ? selectedCat?.nameAr : selectedCat?.name;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-b from-primary/10 to-transparent px-4 py-12 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Gift className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-heading font-bold text-foreground">{t('Gift Guide', 'دليل الهدايا')}</h1>
        </div>
        <p className="text-muted-foreground max-w-lg mx-auto">{t('Find the perfect gift for every occasion and age', 'ابحث عن الهدية المثالية لكل مناسبة وعمر')}</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Categories */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">{t('Browse by', 'تصفح حسب')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {GIFT_CATEGORIES.map(cat => (
              <button
                key={cat.slug}
                onClick={() => setSelected(cat.slug)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selected === cat.slug
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {lang === 'ar' ? cat.nameAr : cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Selected category */}
        <div className="mb-6">
          <h2 className="text-2xl font-heading font-bold text-foreground mb-1">{catName}</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} items</p>
        </div>

        {/* Products grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t('No products found in this category.', 'لا توجد منتجات في هذه الفئة.')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filtered.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}