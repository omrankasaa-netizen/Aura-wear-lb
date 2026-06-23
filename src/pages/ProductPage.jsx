import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useLang } from '@/contexts/LanguageContext';
import { useCart } from '@/contexts/CartContext';
import { useDiscounts } from '@/contexts/DiscountContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, ChevronLeft, ChevronRight, Truck, ShieldCheck, MessageCircle, Minus, Plus, X } from 'lucide-react';
import WishlistHeart from '@/components/storefront/WishlistHeart';
import { ReviewList, ReviewForm } from '@/components/storefront/ReviewCard';
import { BRAND, whatsappLink } from '@/lib/brand';
import { imageSrc, handleImageError } from '@/lib/imageFraming';

const COLOR_HEX = {
  White: '#FFFFFF', Black: '#111111', Beige: '#E9E3DA', Cream: '#FAF8F4',
  Blue: '#1F2A37', Navy: '#1F2A37', Olive: '#5A5E45', Grey: '#9CA3AF',
  Brown: '#6B4F3A', Green: '#3B6E4D', Red: '#B23A2E', Charcoal: '#26262A',
  Stone: '#D8D2C7', Khaki: '#9A8F73',
};

function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between py-4 text-left">
        <span className="font-display uppercase tracking-wide text-sm">{title}</span>
        <Plus className={`w-4 h-4 transition-transform ${open ? 'rotate-45' : ''}`} />
      </button>
      {open && <div className="pb-4 text-sm text-muted-foreground leading-relaxed">{children}</div>}
    </div>
  );
}

export default function ProductPage() {
  const { slug } = useParams();
  const { t, lang } = useLang();
  const { addItem, setIsOpen } = useCart();
  const qc = useQueryClient();
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [qty, setQty] = useState(1);
  const [imgIdx, setImgIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const [sizeHelpOpen, setSizeHelpOpen] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const { getProductDiscount, getDiscountedPrice } = useDiscounts();

  const { data: products = [] } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => base44.entities.Product.filter({ slug }, 'slug', 1),
  });
  const product = products[0];

  const { data: images = [] } = useQuery({
    queryKey: ['product-images', product?.id],
    queryFn: () => base44.entities.ProductImage.filter({ product_id: product.id }, 'sort_order', 20),
    enabled: !!product?.id,
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['product-variants', product?.id],
    queryFn: () => base44.entities.ProductVariant.filter({ product_id: product.id }, 'size', 50),
    enabled: !!product?.id && product?.has_variants,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['product-reviews', product?.id],
    queryFn: () => base44.entities.Review.filter({ product_id: product.id }, '-created_date', 50),
    enabled: !!product?.id,
  });

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  const name = lang === 'ar' ? (product.name_ar || product.name) : product.name;
  const desc = lang === 'ar' ? (product.description_ar || product.description) : product.description;
  const hasCompareDiscount = product.compare_at_price_usd > product.price_usd;
  const autoDiscount = getProductDiscount(product);
  const discountedPrice = autoDiscount ? getDiscountedPrice(product) : null;
  const hasDiscount = hasCompareDiscount || !!autoDiscount;
  const displayPrice = discountedPrice ?? product.price_usd;
  const originalPrice = discountedPrice ? product.price_usd : (hasCompareDiscount ? product.compare_at_price_usd : null);
  const pctOff = originalPrice ? Math.round((1 - displayPrice / originalPrice) * 100) : 0;
  const badgeLabel = autoDiscount ? (lang === 'ar' ? (autoDiscount.badge_label_ar || autoDiscount.badge_label) : autoDiscount.badge_label) : null;
  const colors = product.colors ? product.colors.split('|').map(c => c.trim()).filter(Boolean) : [];
  const sizes = product.sizes ? product.sizes.split('|').map(s => s.trim()).filter(Boolean) : [];
  const displayImages = images.length > 0 ? images : [];

  const selectedVariant = product.has_variants && variants.length > 0
    ? variants.find(v => (!selectedSize || v.size === selectedSize) && (!selectedColor || v.color === selectedColor))
    : null;

  const stockQty = selectedVariant ? (selectedVariant.qty_on_hand || 0) : (product.stock_quantity || 0);
  const needsSize = sizes.length > 0;
  const canAdd = product.has_variants
    ? !!selectedVariant && stockQty > 0
    : (!needsSize || !!selectedSize) && stockQty > 0;

  function handleAdd() {
    addItem(product, selectedVariant || null, qty);
    setAdded(true);
    setIsOpen(true);
    setTimeout(() => setAdded(false), 1800);
  }

  function handleBuyNow() {
    addItem(product, selectedVariant || null, qty);
    window.location.href = '/checkout';
  }

  const waText = `${t('Hi AURA, I want to ask about', 'مرحباً AURA، أريد الاستفسار عن')}: ${name} (${product.sku || product.slug})`;

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6">
        {/* Breadcrumb */}
        <nav className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground mb-5">
          <Link to="/" className="hover:text-foreground">{t('Home', 'الرئيسية')}</Link>
          <span>/</span>
          <Link to="/shop" className="hover:text-foreground">{t('Shop', 'المتجر')}</Link>
          <span>/</span>
          <span className="text-foreground truncate max-w-[200px]">{name}</span>
        </nav>

        <div className="grid lg:grid-cols-2 gap-6 lg:gap-12">
          {/* Gallery */}
          <div className="space-y-3">
            <div className="relative aspect-[4/5] bg-secondary rounded-sm overflow-hidden">
              {displayImages.length > 0 ? (
                <img src={imageSrc(displayImages[imgIdx], 'large')} alt={name} loading="eager" decoding="async" onError={handleImageError} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <img src="/brand/aura-mark.png" alt="" className="w-16 h-16 opacity-20" />
                </div>
              )}
              {hasDiscount && pctOff > 0 && (
                <span className="absolute top-3 left-3 bg-sale text-white text-xs font-display font-semibold px-2.5 py-1 rounded-sm">-{pctOff}%</span>
              )}
              {displayImages.length > 1 && (
                <>
                  <button onClick={() => setImgIdx(i => (i - 1 + displayImages.length) % displayImages.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-background/90 rounded-sm flex items-center justify-center shadow hover:bg-background">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setImgIdx(i => (i + 1) % displayImages.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-background/90 rounded-sm flex items-center justify-center shadow hover:bg-background">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
              <WishlistHeart productId={product.id} className="absolute top-3 right-3 w-10 h-10 rounded-sm bg-background/90 shadow flex items-center justify-center" />
            </div>
            {displayImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {displayImages.map((img, i) => (
                  <button key={i} onClick={() => setImgIdx(i)}
                    className={`w-16 h-20 rounded-sm overflow-hidden shrink-0 border transition-colors ${i === imgIdx ? 'border-foreground' : 'border-transparent hover:border-border'}`}>
                    <img src={imageSrc(img, 'thumb')} alt="" loading="lazy" decoding="async" onError={handleImageError} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="lg:py-2">
            {product.fit && <p className="eyebrow text-muted-foreground mb-2">{product.fit}</p>}
            <h1 className="font-display font-bold uppercase text-2xl sm:text-3xl tracking-tight leading-tight">{name}</h1>

            <div className="flex items-baseline gap-3 mt-3">
              <span className={`text-2xl font-display font-bold ${hasDiscount ? 'text-sale' : ''}`}>${displayPrice?.toFixed(2)}</span>
              {originalPrice && <span className="text-muted-foreground line-through text-lg">${originalPrice?.toFixed(2)}</span>}
              {badgeLabel && <span className="bg-sale text-white text-xs font-display font-semibold px-2.5 py-1 rounded-sm">{badgeLabel}</span>}
            </div>

            {/* Color picker */}
            {colors.length > 0 && (
              <div className="mt-6">
                <p className="text-sm mb-2.5">{t('Color', 'اللون')}{selectedColor && <span className="text-muted-foreground"> — {selectedColor}</span>}</p>
                <div className="flex flex-wrap gap-2.5">
                  {colors.map(c => (
                    <button key={c} onClick={() => setSelectedColor(c)} title={c}
                      className={`w-9 h-9 rounded-full border transition-all ${selectedColor === c ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background border-transparent' : 'border-stone hover:border-foreground'}`}
                      style={{ backgroundColor: COLOR_HEX[c] || '#999' }} />
                  ))}
                </div>
              </div>
            )}

            {/* Size picker */}
            {sizes.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-sm">{t('Size', 'المقاس')}{selectedSize && <span className="text-muted-foreground"> — {selectedSize}</span>}</p>
                  <button onClick={() => setSizeHelpOpen(true)} className="text-xs text-muted-foreground hover:text-foreground underline">{t('Size guide', 'دليل المقاسات')}</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sizes.map(s => {
                    const v = variants.find(vv => vv.size === s && (!selectedColor || vv.color === selectedColor));
                    const outOfStock = product.has_variants && v && (v.qty_on_hand || 0) <= 0;
                    return (
                      <button key={s} onClick={() => !outOfStock && setSelectedSize(s)} disabled={outOfStock}
                        className={`min-w-12 h-12 px-3 rounded-sm border text-sm font-display transition-colors
                          ${outOfStock ? 'border-border text-muted-foreground line-through cursor-not-allowed opacity-50' : selectedSize === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-foreground'}`}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="mt-6">
              <p className="text-sm mb-2.5">{t('Quantity', 'الكمية')}</p>
              <div className="inline-flex items-center border border-border rounded-sm">
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-11 h-11 flex items-center justify-center hover:bg-secondary"><Minus className="w-4 h-4" /></button>
                <span className="w-12 text-center text-sm tabular-nums">{qty}</span>
                <button onClick={() => setQty(q => q + 1)} className="w-11 h-11 flex items-center justify-center hover:bg-secondary"><Plus className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Stock status */}
            {stockQty > 0 && stockQty <= 3 && (
              <p className="mt-4 text-xs font-display uppercase tracking-wide text-sale">{t('Only', 'فقط')} {stockQty} {t('left — order soon', 'متبقي — اطلب الآن')}</p>
            )}

            {/* Desktop actions */}
            <div className="hidden lg:block mt-6 space-y-3">
              <button onClick={handleAdd} disabled={!canAdd}
                className={`w-full h-13 py-3.5 rounded-sm font-display uppercase tracking-[0.12em] text-xs font-semibold flex items-center justify-center gap-2 transition-colors
                  ${canAdd ? (added ? 'bg-success text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90') : 'bg-secondary text-muted-foreground cursor-not-allowed'}`}>
                <ShoppingBag className="w-4 h-4" />
                {added ? t('Added to bag', 'أُضيف للسلة') : !canAdd && stockQty === 0 ? t('Out of stock', 'نفذ المخزون') : needsSize && !selectedSize ? t('Select a size', 'اختر مقاساً') : t('Add to bag', 'أضف للسلة')}
              </button>
              <button onClick={handleBuyNow} disabled={!canAdd}
                className={`w-full h-13 py-3.5 rounded-sm font-display uppercase tracking-[0.12em] text-xs font-semibold border transition-colors ${canAdd ? 'border-foreground hover:bg-foreground hover:text-background' : 'border-border text-muted-foreground cursor-not-allowed'}`}>
                {t('Buy it now', 'اشترِ الآن')}
              </button>
              <a href={whatsappLink(waText)} target="_blank" rel="noreferrer"
                className="w-full h-12 rounded-sm font-display uppercase tracking-[0.12em] text-xs flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground">
                <MessageCircle className="w-4 h-4" /> {t('Ask on WhatsApp', 'اسأل على واتساب')}
              </a>
            </div>

            {/* Reassurance */}
            <div className="mt-6 space-y-2.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2.5"><Truck className="w-4 h-4 shrink-0" /> {t('Fast delivery across Lebanon', 'توصيل سريع لكل لبنان')}</div>
              <div className="flex items-center gap-2.5"><ShieldCheck className="w-4 h-4 shrink-0" /> {t('Cash on delivery available', 'الدفع عند الاستلام متاح')}</div>
            </div>

            {/* Accordions */}
            <div className="mt-8">
              {desc && (
                <Accordion title={t('Description', 'الوصف')} defaultOpen>
                  <p>{desc}</p>
                </Accordion>
              )}
              <Accordion title={t('Shipping & returns', 'الشحن والإرجاع')}>
                <p>{t('Delivered across Lebanon. Cash on delivery available. Contact us on WhatsApp for exchanges.', 'يُوصل لكل لبنان. الدفع عند الاستلام متاح. تواصل معنا على واتساب للاستبدال.')}</p>
              </Accordion>
            </div>
          </div>
        </div>

        {/* Reviews */}
        <div className="border-t border-border pt-10 mt-12">
          <h3 className="font-display font-bold uppercase text-xl tracking-tight mb-6">{t('Reviews', 'التقييمات')}</h3>
          <div className="space-y-6 max-w-2xl">
            <ReviewList reviews={reviews} />
            <ReviewForm
              productId={product.id}
              isSubmitting={reviewSubmitting}
              onSubmit={async (data) => {
                setReviewSubmitting(true);
                try {
                  await base44.entities.Review.create({ ...data, is_published: false });
                  qc.invalidateQueries({ queryKey: ['product-reviews', product.id] });
                } finally {
                  setReviewSubmitting(false);
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Sticky mobile add-to-cart bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-background border-t border-border px-4 py-3 flex items-center gap-3">
        <div className="shrink-0">
          <p className={`text-lg font-display font-bold leading-none ${hasDiscount ? 'text-sale' : ''}`}>${displayPrice?.toFixed(2)}</p>
          {originalPrice && <p className="text-xs text-muted-foreground line-through">${originalPrice?.toFixed(2)}</p>}
        </div>
        <button onClick={handleAdd} disabled={!canAdd}
          className={`flex-1 h-12 rounded-sm font-display uppercase tracking-[0.12em] text-xs font-semibold flex items-center justify-center gap-2 transition-colors
            ${canAdd ? (added ? 'bg-success text-white' : 'bg-primary text-primary-foreground') : 'bg-secondary text-muted-foreground cursor-not-allowed'}`}>
          <ShoppingBag className="w-4 h-4" />
          {added ? t('Added', 'أُضيف') : !canAdd && stockQty === 0 ? t('Sold out', 'نفذ') : needsSize && !selectedSize ? t('Select size', 'اختر مقاساً') : t('Add to bag', 'أضف للسلة')}
        </button>
      </div>

      {/* Size guide drawer */}
      {sizeHelpOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setSizeHelpOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-96 max-w-full bg-background flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between px-5 h-16 border-b border-border">
              <h2 className="font-display uppercase tracking-wide">{t('Size guide', 'دليل المقاسات')}</h2>
              <button onClick={() => setSizeHelpOpen(false)} className="w-10 h-10 flex items-center justify-center -mr-2"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-sm text-muted-foreground leading-relaxed space-y-3">
              <p>{t('Our fits run true to size. If you prefer an oversized look, size up.', 'مقاساتنا مطابقة. إذا كنت تفضل الإطلالة الواسعة، اختر مقاساً أكبر.')}</p>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 font-display uppercase text-xs">{t('Size', 'المقاس')}</th>
                    <th className="py-2 font-display uppercase text-xs">{t('Chest (cm)', 'الصدر (سم)')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[['S', '92-96'], ['M', '98-102'], ['L', '104-108'], ['XL', '110-114'], ['XXL', '116-120']].map(([sz, ch]) => (
                    <tr key={sz} className="border-b border-border/60">
                      <td className="py-2 font-display">{sz}</td>
                      <td className="py-2">{ch}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>{t('Still unsure? Message us on WhatsApp and we’ll help.', 'غير متأكد؟ راسلنا على واتساب وسنساعدك.')}</p>
              <a href={whatsappLink(`${t('Hi AURA, I need sizing help with', 'مرحباً AURA، أحتاج مساعدة بالمقاس لـ')}: ${name}`)} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 text-foreground underline"><MessageCircle className="w-4 h-4" /> {BRAND.whatsappNumber}</a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
