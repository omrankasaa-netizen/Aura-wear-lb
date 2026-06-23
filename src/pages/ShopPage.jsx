import React, { useState, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { useDiscounts } from '@/contexts/DiscountContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import ProductCard from '@/components/storefront/ProductCard';
import { SlidersHorizontal, X, Search } from 'lucide-react';
import { FIT_OPTIONS } from '@/lib/brand';

function useUrlFilters() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  function get(key, def = '') { return params.get(key) || def; }
  function getArr(key) { const v = params.get(key); return v ? v.split(',').filter(Boolean) : []; }
  function set(updates) {
    const p = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(updates)) {
      if (!v || (Array.isArray(v) && v.length === 0)) p.delete(k);
      else p.set(k, Array.isArray(v) ? v.join(',') : v);
    }
    navigate({ search: p.toString() }, { replace: true });
  }
  function clear() { navigate({ search: '' }, { replace: true }); }
  return { get, getArr, set, clear, params };
}

const COLOR_HEX = {
  White: '#FFFFFF', Black: '#111111', Beige: '#E9E3DA', Cream: '#FAF8F4',
  Blue: '#1F2A37', Navy: '#1F2A37', Olive: '#5A5E45', Grey: '#9CA3AF',
  Brown: '#6B4F3A', Green: '#3B6E4D', Red: '#B23A2E', Charcoal: '#26262A',
  Stone: '#D8D2C7', Khaki: '#9A8F73',
};

function ColorSwatch({ color, active, onClick }) {
  const hex = COLOR_HEX[color] || '#999';
  return (
    <button onClick={onClick} title={color}
      className={`w-7 h-7 rounded-full border transition-all ${active ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background border-transparent' : 'border-stone hover:border-foreground'}`}
      style={{ backgroundColor: hex }} />
  );
}

function FilterSection({ title, children }) {
  return (
    <div className="border-b border-border py-4 last:border-b-0">
      <p className="eyebrow text-muted-foreground mb-3">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export default function ShopPage() {
  const { t, lang } = useLang();
  const { liveDiscounts, getDiscountedPrice } = useDiscounts();
  const { get, getArr, set, clear } = useUrlFilters();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const search = get('q');
  const filterCategory = get('category'); // may be slug or id
  const filterFits = getArr('fits');
  const filterSizes = getArr('sizes');
  const filterColors = getArr('colors');
  const filterOnSale = get('sale') === '1';
  const filterInStock = get('stock') === '1';
  const filterSort = get('sort', 'new');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['shop-products'],
    queryFn: () => base44.entities.Product.filter({ status: 'Active' }, '-created_date', 500),
  });
  const { data: images = [] } = useQuery({
    queryKey: ['shop-product-images'],
    queryFn: () => base44.entities.ProductImage.list('-created_date', 3000),
    enabled: products.length > 0, staleTime: 60_000,
  });
  const { data: variants = [] } = useQuery({
    queryKey: ['shop-variants'],
    queryFn: () => base44.entities.ProductVariant.list('-created_date', 3000),
    enabled: products.length > 0, staleTime: 60_000,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.filter({ is_active: true }, 'sort_order', 100),
  });

  const imgMap = useMemo(() => {
    const m = {};
    for (const img of images) { if (!m[img.product_id] || img.is_primary) m[img.product_id] = img.url; }
    return m;
  }, [images]);
  // Full per-product photo set (primary first, then sort_order) with framing
  // metadata, for the in-card carousel.
  const cardImagesMap = useMemo(() => {
    const m = {};
    for (const img of images) {
      (m[img.product_id] ||= []).push(img);
    }
    for (const id of Object.keys(m)) {
      m[id] = m[id]
        .slice()
        .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.sort_order || 0) - (b.sort_order || 0))
        .map(img => ({ url: img.url, variants: img.variants, focal: img.focal, crop: img.crop, alt: img.alt }));
    }
    return m;
  }, [images]);
  const variantsByProduct = useMemo(() => {
    const m = {};
    for (const v of variants) { if (!m[v.product_id]) m[v.product_id] = []; m[v.product_id].push(v); }
    return m;
  }, [variants]);
  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const catBySlug = useMemo(() => Object.fromEntries(categories.map(c => [c.slug, c])), [categories]);

  // Resolve the active category from slug or id.
  const activeCat = catBySlug[filterCategory] || catMap[filterCategory] || null;

  const availableSizes = useMemo(() => {
    const s = new Set();
    for (const p of products) { if (p.sizes) p.sizes.split('|').forEach(x => x.trim() && s.add(x.trim())); }
    return [...s];
  }, [products]);
  const availableColors = useMemo(() => {
    const s = new Set();
    for (const p of products) { if (p.colors) p.colors.split('|').forEach(x => x.trim() && s.add(x.trim())); }
    return [...s].sort();
  }, [products]);

  const enriched = useMemo(() => products.map(p => {
    const pvs = variantsByProduct[p.id] || [];
    const totalStock = p.has_variants && pvs.length > 0
      ? pvs.reduce((s, v) => s + (v.qty_on_hand || 0), 0)
      : (p.stock_quantity || 0);
    return { ...p, primaryImage: imgMap[p.id] || null, cardImages: cardImagesMap[p.id] || [], totalStock };
  }), [products, imgMap, cardImagesMap, variantsByProduct]);

  function isOnSale(p) {
    if (p.compare_at_price_usd && p.compare_at_price_usd > p.price_usd) return true;
    return getDiscountedPrice(p) < p.price_usd;
  }

  const filtered = useMemo(() => {
    let list = enriched.filter(p => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.name?.toLowerCase().includes(q) && !(p.name_ar || '').includes(q) && !(p.sku || '').toLowerCase().includes(q)) return false;
      }
      if (activeCat) {
        if (p.category_id !== activeCat.id && p.subcategory_id !== activeCat.id) return false;
      }
      if (filterFits.length > 0) {
        const tags = (p.tags || '') + ' ' + (p.fit || '');
        if (!filterFits.some(f => tags.toLowerCase().includes(f.toLowerCase()))) return false;
      }
      if (filterSizes.length > 0) {
        const pSizes = (p.sizes || '').split('|').map(s => s.trim());
        if (!filterSizes.some(s => pSizes.includes(s))) return false;
      }
      if (filterColors.length > 0) {
        const pColors = (p.colors || '').split('|').map(c => c.trim());
        if (!filterColors.some(c => pColors.includes(c))) return false;
      }
      if (filterOnSale && !isOnSale(p)) return false;
      if (filterInStock && p.totalStock <= 0) return false;
      return true;
    });
    switch (filterSort) {
      case 'price_asc': list = [...list].sort((a, b) => a.price_usd - b.price_usd); break;
      case 'price_desc': list = [...list].sort((a, b) => b.price_usd - a.price_usd); break;
      case 'featured': list = [...list].sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0)); break;
      default: list = [...list].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)); break;
    }
    return list;
  }, [enriched, search, activeCat, filterFits, filterSizes, filterColors, filterOnSale, filterInStock, filterSort, liveDiscounts]);

  const activeCount = [filterFits.length, filterSizes.length, filterColors.length, filterOnSale ? 1 : 0, filterInStock ? 1 : 0].reduce((a, b) => a + b, 0);

  function FilterPanel() {
    return (
      <div>
        <FilterSection title={t('Collections', 'المجموعات')}>
          <button onClick={() => set({ category: '' })}
            className={`block w-full text-left text-sm py-1 ${!activeCat ? 'font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>
            {t('All Products', 'كل المنتجات')}
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => set({ category: c.slug })}
              className={`block w-full text-left text-sm py-1 ${activeCat?.id === c.id ? 'font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>
              {lang === 'ar' ? (c.name_ar || c.name) : c.name}
            </button>
          ))}
        </FilterSection>

        <FilterSection title={t('Fit', 'القَصّة')}>
          <div className="flex flex-wrap gap-2">
            {FIT_OPTIONS.map(f => (
              <button key={f} onClick={() => set({ fits: filterFits.includes(f) ? filterFits.filter(x => x !== f) : [...filterFits, f] })}
                className={`text-xs uppercase tracking-wide font-display px-3 h-9 rounded-sm border transition-colors ${filterFits.includes(f) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-foreground'}`}>
                {f}
              </button>
            ))}
          </div>
        </FilterSection>

        {availableSizes.length > 0 && (
          <FilterSection title={t('Size', 'المقاس')}>
            <div className="flex flex-wrap gap-2">
              {availableSizes.map(s => (
                <button key={s} onClick={() => set({ sizes: filterSizes.includes(s) ? filterSizes.filter(x => x !== s) : [...filterSizes, s] })}
                  className={`min-w-9 h-9 px-2 text-xs font-display rounded-sm border transition-colors ${filterSizes.includes(s) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-foreground'}`}>
                  {s}
                </button>
              ))}
            </div>
          </FilterSection>
        )}

        {availableColors.length > 0 && (
          <FilterSection title={t('Color', 'اللون')}>
            <div className="flex flex-wrap gap-2.5">
              {availableColors.map(c => (
                <ColorSwatch key={c} color={c} active={filterColors.includes(c)}
                  onClick={() => set({ colors: filterColors.includes(c) ? filterColors.filter(x => x !== c) : [...filterColors, c] })} />
              ))}
            </div>
          </FilterSection>
        )}

        <FilterSection title={t('More', 'المزيد')}>
          <label className="flex items-center gap-2.5 cursor-pointer py-1" onClick={() => set({ sale: filterOnSale ? '' : '1' })}>
            <span className={`w-9 h-5 rounded-sm transition-colors ${filterOnSale ? 'bg-primary' : 'bg-stone'}`}>
              <span className={`block w-4 h-4 m-0.5 bg-white rounded-sm transition-transform ${filterOnSale ? 'translate-x-4' : ''}`} />
            </span>
            <span className="text-sm">{t('On sale only', 'التخفيضات فقط')}</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer py-1" onClick={() => set({ stock: filterInStock ? '' : '1' })}>
            <span className={`w-9 h-5 rounded-sm transition-colors ${filterInStock ? 'bg-primary' : 'bg-stone'}`}>
              <span className={`block w-4 h-4 m-0.5 bg-white rounded-sm transition-transform ${filterInStock ? 'translate-x-4' : ''}`} />
            </span>
            <span className="text-sm">{t('In stock only', 'المتوفر فقط')}</span>
          </label>
        </FilterSection>
      </div>
    );
  }

  const title = activeCat ? (lang === 'ar' ? (activeCat.name_ar || activeCat.name) : activeCat.name) : t('Shop All', 'كل المنتجات');

  return (
    <div className="min-h-screen">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Breadcrumb + header */}
        <nav className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground mb-4">
          <Link to="/" className="hover:text-foreground">{t('Home', 'الرئيسية')}</Link>
          <span>/</span>
          <span className="text-foreground">{title}</span>
        </nav>
        <div className="mb-6">
          <h1 className="font-display font-bold uppercase text-3xl sm:text-4xl tracking-tight">{title}</h1>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center gap-2 border border-border rounded-sm px-3 h-11 flex-1 max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input value={search} onChange={e => set({ q: e.target.value })} placeholder={t('Search…', 'بحث…')}
              className="bg-transparent text-sm flex-1 outline-none" />
            {search && <button onClick={() => set({ q: '' })}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
          </div>
          <button onClick={() => setMobileFilterOpen(true)}
            className="lg:hidden flex items-center gap-2 border border-border rounded-sm px-4 h-11 text-xs uppercase tracking-wide font-display">
            <SlidersHorizontal className="w-4 h-4" /> {t('Filter', 'فلتر')}
            {activeCount > 0 && <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 text-[10px] flex items-center justify-center">{activeCount}</span>}
          </button>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block tabular-nums">{filtered.length} {t('items', 'منتج')}</span>
            <select value={filterSort} onChange={e => set({ sort: e.target.value })}
              className="border border-border rounded-sm px-3 h-11 text-sm outline-none cursor-pointer bg-background">
              <option value="new">{t('Newest', 'الأحدث')}</option>
              <option value="price_asc">{t('Price ↑', 'السعر ↑')}</option>
              <option value="price_desc">{t('Price ↓', 'السعر ↓')}</option>
              <option value="featured">{t('Best Selling', 'الأكثر مبيعاً')}</option>
            </select>
          </div>
        </div>

        <div className="flex gap-8">
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="sticky top-28">
              <div className="flex items-center justify-between mb-2">
                <p className="eyebrow">{t('Filters', 'الفلاتر')}</p>
                {activeCount > 0 && <button onClick={clear} className="text-xs text-muted-foreground hover:text-foreground">{t('Clear', 'مسح')}</button>}
              </div>
              <FilterPanel />
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
                {Array.from({ length: 12 }).map((_, i) => <div key={i} className="aspect-[4/5] bg-secondary animate-pulse rounded-sm" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-24 flex flex-col items-center gap-4">
                <img src="/brand/aura-mark.png" alt="" className="w-12 h-12 opacity-25" />
                <div>
                  <p className="font-display uppercase tracking-wide">{t('Nothing here yet.', 'لا شيء هنا بعد.')}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('New drops are landing soon — follow us on Instagram.', 'الدروبات الجديدة قريباً — تابعنا على إنستغرام.')}</p>
                </div>
                {(activeCount > 0 || activeCat || search) && <button onClick={clear} className="btn-outline h-11">{t('Clear filters', 'مسح الفلاتر')}</button>}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
                {filtered.map(p => <ProductCard key={p.id} product={p} />)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileFilterOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50 lg:hidden" onClick={() => setMobileFilterOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-80 max-w-full bg-background flex flex-col lg:hidden shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between px-5 h-16 border-b border-border shrink-0">
              <h2 className="font-display uppercase tracking-wide">{t('Filters', 'الفلاتر')}</h2>
              <button onClick={() => setMobileFilterOpen(false)} className="w-10 h-10 flex items-center justify-center -mr-2"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5">
              <FilterPanel />
            </div>
            <div className="px-5 py-4 border-t border-border shrink-0 flex gap-3">
              <button onClick={() => { clear(); setMobileFilterOpen(false); }} className="btn-outline flex-1 h-12">{t('Clear', 'مسح')}</button>
              <button onClick={() => setMobileFilterOpen(false)} className="btn-primary flex-1">{t('Show', 'عرض')} ({filtered.length})</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
