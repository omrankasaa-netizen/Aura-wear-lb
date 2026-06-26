import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, MessageCircle } from 'lucide-react';
import { useLang } from '@/contexts/LanguageContext';
import { useCart } from '@/contexts/CartContext';
import { useDiscounts } from '@/contexts/DiscountContext';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { motion } from 'framer-motion';
import WishlistHeart from './WishlistHeart';
import { BRAND, whatsappLink } from '@/lib/brand';
import CardImageCarousel from './CardImageCarousel';

function Badge({ children, tone = 'dark' }) {
  const tones = {
    dark: 'bg-primary text-primary-foreground',
    sale: 'bg-sale text-white',
    light: 'bg-background text-foreground border border-border',
  };
  return <span className={`eyebrow text-[10px] px-2 py-1 ${tones[tone]}`}>{children}</span>;
}

export default function ProductCard({ product }) {
  const { t, lang } = useLang();
  const { addItem, setIsOpen } = useCart();
  const { getProductDiscount, getDiscountedPrice } = useDiscounts();
  const settings = useSiteSettings();
  const [added, setAdded] = useState(false);
  const [activeColor, setActiveColor] = useState(null);

  const name = lang === 'ar' ? (product.name_ar || product.name) : product.name;
  const isOutOfStock = (product.stock_quantity || 0) <= 0 && !product.has_variants;
  const isLowStock = !isOutOfStock && (product.stock_quantity || 0) > 0 && (product.stock_quantity || 0) <= 3;
  const hasCompareDiscount = product.compare_at_price_usd > product.price_usd;
  const autoDiscount = getProductDiscount(product);
  const discountedPrice = autoDiscount ? getDiscountedPrice(product) : null;
  const hasDiscount = hasCompareDiscount || !!autoDiscount;
  const displayPrice = discountedPrice ?? product.price_usd;
  const originalPrice = discountedPrice ? product.price_usd : (hasCompareDiscount ? product.compare_at_price_usd : null);
  const pctOff = originalPrice && displayPrice ? Math.round((1 - displayPrice / originalPrice) * 100) : null;
  const fit = product.fit || (product.tags && /oversized|relaxed|slim|regular/i.test(product.tags) ? (product.tags.match(/oversized|relaxed|slim|regular/i) || [])[0] : null);

  const primaryImg = product.primaryImage || product.image_url;
  const secondImg = product.secondaryImage || product.hoverImage;

  // Full photo set for the in-card carousel. Prefer the rich `cardImages` array
  // (each { url, focal?, crop?, alt? }) when a grid passes it; otherwise fall
  // back to the legacy primary/secondary URLs so existing callers keep working.
  const cardImages = (Array.isArray(product.cardImages) && product.cardImages.length > 0)
    ? product.cardImages
    : [primaryImg, secondImg].filter(Boolean).map(url => ({ url, alt: name }));

  // Fix #4: let shoppers preview color variants right on the card. Colors come
  // from the product's pipe-joined `colors` string. Picking a swatch jumps the
  // card carousel to the first photo whose `color` matches (admins link photos
  // to colors in the product editor). Only show swatches when at least one card
  // photo is actually linked to a color, so we never show dead swatches.
  const cardColors = (product.colors ? product.colors.split('|').map(c => c.trim()).filter(Boolean) : []);
  const colorHasPhoto = (c) => cardImages.some(im => (im.color || '').toLowerCase() === c.toLowerCase());
  const swatchColors = cardColors.filter(colorHasPhoto);
  const colorJumpIndex = activeColor
    ? cardImages.findIndex(im => (im.color || '').toLowerCase() === activeColor.toLowerCase())
    : null;

  function handleAdd(e) {
    e.preventDefault();
    if (isOutOfStock || product.has_variants) return;
    addItem(product, null, 1);
    setAdded(true);
    setIsOpen(true);
    setTimeout(() => setAdded(false), 1800);
  }

  const waText = t(`Hi AURA, is "${product.name}" available? Sizes/colors?`, `مرحباً AURA، هل "${product.name}" متوفّر؟`);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="group">
      <Link to={`/product/${product.slug}`} className="block">
        <div className="relative aspect-[3/4] bg-secondary overflow-hidden rounded-sm">
          <CardImageCarousel images={cardImages} fallbackAlt={name} rtl={lang === 'ar'} jumpToIndex={colorJumpIndex} />

          {/* Badges */}
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
            {product.is_new && <Badge>{t('New', 'جديد')}</Badge>}
            {product.is_best_seller && <Badge tone="light">{t('Best Seller', 'الأكثر مبيعاً')}</Badge>}
            {product.is_limited && <Badge tone="light">{t('Limited', 'محدود')}</Badge>}
            {hasDiscount && <Badge tone="sale">{pctOff ? `-${pctOff}%` : t('Sale', 'تخفيض')}</Badge>}
            {isLowStock && <Badge tone="light">{t('Low stock', 'كمية قليلة')}</Badge>}
          </div>

          {/* Wishlist */}
          <WishlistHeart productId={product.id} className="absolute top-2 right-2 w-9 h-9 bg-background/90 backdrop-blur rounded-sm" />

          {/* WhatsApp inquiry (desktop hover) */}
          <a href={whatsappLink(waText, settings.whatsappNumber || BRAND.whatsappNumber)} target="_blank" rel="noopener"
            onClick={(e) => e.stopPropagation()}
            className="hidden lg:flex absolute bottom-2 right-2 w-9 h-9 bg-background/90 backdrop-blur rounded-sm items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-primary-foreground"
            aria-label={t('Ask on WhatsApp', 'اسأل عبر واتساب')}>
            <MessageCircle className="w-4 h-4" strokeWidth={1.5} />
          </a>

          {/* Quick add (desktop, no-variant only) */}
          {!isOutOfStock && !product.has_variants && (
            <button onClick={handleAdd}
              className={`hidden lg:flex absolute bottom-2 left-2 right-12 h-9 items-center justify-center gap-1.5 text-[11px] uppercase tracking-wide font-display opacity-0 group-hover:opacity-100 transition-all rounded-sm ${added ? 'bg-success text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
              {added ? t('Added', 'تمت الإضافة') : <><ShoppingBag className="w-3.5 h-3.5" /> {t('Quick add', 'إضافة سريعة')}</>}
            </button>
          )}

          {isOutOfStock && (
            <div className="absolute inset-0 bg-background/55 flex items-center justify-center">
              <span className="eyebrow bg-background px-3 py-1.5 border border-border">{t('Sold out', 'نفد')}</span>
            </div>
          )}
        </div>

        <div className="pt-3">
          {fit && <p className="eyebrow text-muted-foreground text-[10px] mb-1">{fit}</p>}
          <p className="text-sm font-medium leading-snug line-clamp-1">{name}</p>

          {/* Color options as clickable text chips, shown below the card image.
              Hover or click swaps the card photo to the matching color's photo
              without navigating into the product page. */}
          {swatchColors.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5" onClick={(e) => e.preventDefault()}>
              {swatchColors.slice(0, 5).map(c => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  aria-label={c}
                  onMouseEnter={() => setActiveColor(c)}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveColor(c); }}
                  className={`text-[11px] leading-none px-2 py-1 rounded-full border transition-colors ${activeColor === c ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'}`}
                >
                  {c}
                </button>
              ))}
              {swatchColors.length > 5 && <span className="text-[10px] text-muted-foreground">+{swatchColors.length - 5}</span>}
            </div>
          )}
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-sm font-semibold tabular-nums ${hasDiscount ? 'text-sale' : 'text-foreground'}`}>${displayPrice?.toFixed(2)}</span>
            {originalPrice && <span className="text-xs text-muted-foreground line-through tabular-nums">${originalPrice?.toFixed(2)}</span>}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
