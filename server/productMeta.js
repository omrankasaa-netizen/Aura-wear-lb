// Server-side per-product SEO / social metadata for the SPA.
//
// Product detail pages are a client-rendered React SPA. Meta's (Facebook)
// crawler and Pixel microdata scanner do NOT reliably execute JS, so they only
// ever saw the static index.html shell with the site-wide defaults — which is
// why the catalog microdata debugger reports missing `id`, `availability` and
// `price`. To fix that, the Express server intercepts `/product/:slug`, loads
// the product from the same SQLite DB the API uses, and rewrites the served
// index.html <head> with per-product OpenGraph product tags + JSON-LD Product
// schema BEFORE the SPA fallback. The marker region in index.html
// (AURA_SOCIAL_META_START/END) is replaced so no duplicate/conflicting
// og:type or canonical is left behind.

import { queryRecords } from './db.js';
import { normalizeSku, publicBaseUrl } from './meta.js';

const SITE_BASE = publicBaseUrl();
const DEFAULT_SHARE_IMAGE = `${SITE_BASE}/brand/aura-icon-512.png`;

const SOCIAL_START = '<!-- AURA_SOCIAL_META_START';
const SOCIAL_END = 'AURA_SOCIAL_META_END -->';

// Escape a string for safe interpolation into an HTML attribute value.
function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Look up a single product by its URL slug. Returns null when not found.
export function getProductBySlug(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const rows = queryRecords('Product', { query: { slug }, limit: 1 });
  return rows[0] || null;
}

function pickPublicProductFields(product) {
  return {
    id: product.id,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    name_ar: product.name_ar,
    description: product.description,
    description_ar: product.description_ar,
    short_description: product.short_description,
    short_description_ar: product.short_description_ar,
    price_usd: product.price_usd,
    compare_at_price_usd: product.compare_at_price_usd,
    image_url: product.image_url,
    fit: product.fit,
    status: product.status,
    is_featured: product.is_featured,
    is_new: product.is_new,
    has_variants: product.has_variants,
    stock_quantity: product.stock_quantity,
    colors: product.colors,
    sizes: product.sizes,
    category_id: product.category_id,
    subcategory_id: product.subcategory_id,
  };
}

function pickPublicImageFields(image) {
  return {
    id: image.id,
    product_id: image.product_id,
    image_url: image.image_url,
    url: image.url,
    file_url: image.file_url,
    variants: image.variants,
    image_variants: image.image_variants,
    is_primary: image.is_primary,
    sort_order: image.sort_order,
    color: image.color,
  };
}

function pickPublicVariantFields(variant) {
  return {
    id: variant.id,
    product_id: variant.product_id,
    sku: variant.sku,
    size: variant.size,
    color: variant.color,
    price_usd: variant.price_usd,
    qty_on_hand: variant.qty_on_hand,
    qty_reserved: variant.qty_reserved,
  };
}

export function buildPreloadedProductPayload(product) {
  const images = queryRecords('ProductImage', {
    query: { product_id: product.id }, sort: 'sort_order', limit: 20,
  }).map(pickPublicImageFields);
  const variants = product.has_variants
    ? queryRecords('ProductVariant', {
      query: { product_id: product.id }, sort: 'size', limit: 50,
    }).map(pickPublicVariantFields)
    : [];
  const publishedReviewsCount = queryRecords('Review', {
    query: { product_id: product.id, is_published: true }, limit: 5000,
  }).length;

  return {
    slug: product.slug,
    product: pickPublicProductFields(product),
    images,
    variants,
    publishedReviewsCount,
  };
}

export function injectPreloadedProduct(template, payload) {
  if (!payload || !payload.product) return template;
  const headEnd = template.lastIndexOf('</head>');
  if (headEnd === -1) return template;
  // Escape `<` so no payload value can break out of the <script> element.
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const script = `\n    <script>window.__PRELOADED_PRODUCT__ = ${safeJson};</script>\n`;
  return template.slice(0, headEnd) + script + template.slice(headEnd);
}

// Aggregate rating from published reviews for JSON-LD. Returns null when the
// product has no published reviews (schema omitted entirely in that case) or
// when the Review table is unavailable. ratingValue is rounded to 1 decimal.
function getAggregateRating(productId) {
  try {
    const reviews = queryRecords('Review', { query: { product_id: productId }, limit: 5000 })
      .filter((r) => r.is_published && Number.isFinite(Number(r.rating)));
    if (reviews.length === 0) return null;
    const avg = reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length;
    return { ratingValue: Math.round(avg * 10) / 10, reviewCount: reviews.length };
  } catch {
    return null;
  }
}

// Meta only auto-populates a catalog entry when it can read a numeric price.
// Return a "18.99"-style string, or null when the stored value is not a finite
// number (never invent a price).
function formatPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

// JSON-LD/OG image must be absolute.
function absolutize(url) {
  const v = String(url || '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `${SITE_BASE}${v.startsWith('/') ? '' : '/'}${v}`;
}

// Resolve the product's primary image the SAME way the catalog feed routes do:
// Product.image_url first, then the first ProductImage row (by sort_order).
// When the record carries a variants map, prefer the large derivative (best
// for og:image) with card/original as fallbacks. Many products have an empty
// Product.image_url — their images live only in ProductImage rows — which used
// to make og:image fall back to the brand icon.
function resolveProductImage(product) {
  const direct = absolutize(product.image_url);
  if (direct) return direct;
  try {
    const rows = queryRecords('ProductImage', {
      query: { product_id: product.id }, sort: 'sort_order', limit: 1,
    });
    const img = rows[0];
    if (!img) return '';
    const variants = img.variants || img.image_variants || null;
    const candidate =
      (variants && (variants.large || variants.card || variants.thumb)) ||
      img.image_url || img.url || img.file_url || '';
    return absolutize(candidate);
  } catch {
    return '';
  }
}

// Build the replacement <head> block (SEO + OG product tags + JSON-LD) for a
// product. Uses English fields — the crawler is locale-agnostic and the client
// still renders the localized UI. Returns an indented HTML string.
export function buildProductMetaBlock(product) {
  const slug = product.slug || product.id;
  const url = `${SITE_BASE}/product/${slug}`;
  // Catalog identifier for Meta's crawler / Pixel microdata scanner. MUST equal
  // the feed `id` exactly (Meta catalog matching is case-sensitive), so use the
  // SAME normalizeSku the feed applies — never the raw sku or the internal DB id.
  // Empty when the product has no sku; such products are absent from the feed
  // (see buildFeedCsv), so we omit the catalog-id microdata rather than emit a
  // non-feed value that could only ever land as an unmatched event.
  const sku = normalizeSku(product.sku);
  // Trim catalog values — trailing spaces in DB fields otherwise leak straight
  // into og:title / JSON-LD.
  const name = (product.name || 'AURA').trim();
  const socialDesc = (product.short_description || product.description || '').trim();
  const jsonLdDesc = (product.description || product.short_description || '').trim();
  // JSON-LD/OG image must be absolute. Resolved like the catalog feed
  // (Product.image_url, else first ProductImage row, large variant preferred).
  const resolvedImage = resolveProductImage(product);
  const image = resolvedImage || DEFAULT_SHARE_IMAGE;
  // Availability from the stock fields (mirrors the meta-feed logic, with one
  // legacy tolerance: an Active product whose stock_quantity was never set at
  // all is treated as available — only an explicit 0 marks it out).
  const isActive = product.status === 'Active';
  const stockQty = product.stock_quantity;
  const inStock = isActive && (product.has_variants || stockQty == null || Number(stockQty) > 0);
  const availabilityOg = inStock ? 'in stock' : 'out of stock';
  const availabilitySchema = inStock
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';
  const price = formatPrice(product.price_usd);
  const aggregateRating = getAggregateRating(product.id);

  const lines = [];
  lines.push('<!-- Per-product SEO + Meta catalog microdata (server-injected) -->');
  lines.push(`<title>${escapeAttr(name)} | AURA</title>`);
  if (socialDesc) lines.push(`<meta name="description" content="${escapeAttr(socialDesc)}" />`);
  lines.push('<meta name="author" content="AURA" />');
  lines.push(`<link rel="canonical" href="${escapeAttr(url)}" />`);

  // Open Graph product tags — Meta's preferred catalog microdata source.
  lines.push('<meta property="og:type" content="product" />');
  lines.push('<meta property="og:site_name" content="AURA" />');
  lines.push(`<meta property="og:url" content="${escapeAttr(url)}" />`);
  lines.push(`<meta property="og:title" content="${escapeAttr(name)}" />`);
  if (socialDesc) lines.push(`<meta property="og:description" content="${escapeAttr(socialDesc)}" />`);
  lines.push(`<meta property="og:image" content="${escapeAttr(image)}" />`);
  lines.push('<meta property="og:locale" content="en_US" />');
  lines.push('<meta property="og:locale:alternate" content="ar_AR" />');
  if (sku) lines.push(`<meta property="product:retailer_item_id" content="${escapeAttr(sku)}" />`);
  if (price) {
    lines.push(`<meta property="product:price:amount" content="${escapeAttr(price)}" />`);
    lines.push('<meta property="product:price:currency" content="USD" />');
  }
  lines.push(`<meta property="product:availability" content="${availabilityOg}" />`);
  lines.push('<meta property="product:brand" content="AURA" />');
  lines.push('<meta property="product:condition" content="new" />');

  // Twitter card.
  lines.push('<meta name="twitter:card" content="summary_large_image" />');
  lines.push(`<meta name="twitter:title" content="${escapeAttr(name)}" />`);
  if (socialDesc) lines.push(`<meta name="twitter:description" content="${escapeAttr(socialDesc)}" />`);
  lines.push(`<meta name="twitter:image" content="${escapeAttr(image)}" />`);

  // JSON-LD Product schema.
  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    ...(sku ? { productID: sku, sku } : {}),
    name,
    ...(jsonLdDesc ? { description: jsonLdDesc } : {}),
    ...(resolvedImage ? { image } : {}),
    brand: { '@type': 'Brand', name: 'AURA' },
    ...(aggregateRating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: aggregateRating.ratingValue,
            reviewCount: aggregateRating.reviewCount,
          },
        }
      : {}),
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'USD',
      ...(price ? { price } : {}),
      availability: availabilitySchema,
      itemCondition: 'https://schema.org/NewCondition',
    },
  };
  // Escape `<` so a value can never break out of the <script> element.
  const jsonLdStr = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
  lines.push(`<script type="application/ld+json">${jsonLdStr}</script>`);

  return lines.map((l) => `    ${l}`).join('\n');
}

// Replace the site-wide social-meta marker region in the index.html template
// with the per-product block. If the markers are missing (shouldn't happen with
// the shipped template), returns the template unchanged so the SPA still loads.
export function injectProductMeta(template, product) {
  const start = template.indexOf(SOCIAL_START);
  const endMarker = template.indexOf(SOCIAL_END);
  if (start === -1 || endMarker === -1) return template;
  const end = endMarker + SOCIAL_END.length;
  const block = buildProductMetaBlock(product);
  return template.slice(0, start) + block + template.slice(end);
}
