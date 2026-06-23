// Non-destructive image framing for the fixed 3:4 portrait card.
//
// Two optional pieces of per-image metadata (both stored normalized 0..1 on the
// ProductImage entity, no migration needed since entities are generic JSON docs):
//   focal: { x, y }                    -> CSS object-position (where to center the crop)
//   crop:  { x, y, width, height }     -> a sub-rectangle of the source to show
//
// When metadata is absent we fall back to centered object-cover, so existing
// products keep rendering exactly as before.

export const DEFAULT_FOCAL = { x: 0.5, y: 0.5 };

export function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

// A crop is "meaningful" only if it actually narrows the source. A full-frame
// crop (0,0,1,1) is treated as no crop so we use the simpler object-position path.
export function hasCrop(crop) {
  if (!crop) return false;
  const w = clamp01(crop.width);
  const h = clamp01(crop.height);
  if (w <= 0 || h <= 0) return false;
  return w < 0.999 || h < 0.999 || clamp01(crop.x) > 0.001 || clamp01(crop.y) > 0.001;
}

export function focalPosition(focal) {
  const x = clamp01(focal?.x ?? DEFAULT_FOCAL.x) * 100;
  const y = clamp01(focal?.y ?? DEFAULT_FOCAL.y) * 100;
  return `${x}% ${y}%`;
}

// Inline style for an <img> that fills a 3:4 box.
// - With a crop: scale the image up so the crop sub-rectangle fills the box, then
//   translate so the crop's top-left aligns to the box origin. Purely CSS, the
//   original asset is untouched.
// - Without a crop: object-cover + object-position from the focal point.
export function frameImageStyle(focal, crop) {
  if (hasCrop(crop)) {
    const cw = clamp01(crop.width) || 1;
    const ch = clamp01(crop.height) || 1;
    const cx = clamp01(crop.x);
    const cy = clamp01(crop.y);
    // Image is sized to (1/cw, 1/ch) of the box, positioned so the crop shows.
    return {
      position: 'absolute',
      left: 0,
      top: 0,
      width: `${(1 / cw) * 100}%`,
      height: `${(1 / ch) * 100}%`,
      transform: `translate(${-(cx / cw) * 100}%, ${-(cy / ch) * 100}%)`,
      transformOrigin: 'top left',
      maxWidth: 'none',
      objectFit: 'cover',
    };
  }
  return {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: focalPosition(focal),
  };
}

// ── Image source normalization + right-sizing ────────────────────────────────
// Images are uploaded through /api/upload, which compresses them to WebP and
// (when R2 is configured) serves them from AURA's image domain. Each upload
// returns a `variants` map { large, card, thumb }. Older/bulk-imported records
// may only have a single string URL — all the helpers below tolerate both.

// Resolve a stored URL into something the browser can load. Uploaded files are
// stored as site-relative paths (e.g. "/uploads/abc.webp") in local-disk mode,
// or absolute https URLs in R2 mode. Absolute http(s)/data:/blob: are returned
// untouched; a relative path that lost its leading slash is repaired.
export function resolveImageUrl(rawUrl) {
  const url = (rawUrl || '').trim();
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith('/')) return url;
  if (url.startsWith('uploads/')) return `/${url}`;
  return url;
}

function pickUrl(image) {
  if (typeof image === 'string') return image;
  if (!image || typeof image !== 'object') return '';
  return image.url || image.image_url || image.file_url || image.src || '';
}

function readVariants(image) {
  if (!image || typeof image !== 'object') return null;
  const v = image.variants || image.image_variants;
  if (!v || typeof v !== 'object') return null;
  const out = {};
  for (const k of ['large', 'card', 'thumb']) {
    const u = resolveImageUrl(v[k]);
    if (u) out[k] = u;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// Normalize one image entry of any shape into { url, variants, focal, crop }.
export function normalizeImage(image) {
  const url = resolveImageUrl(pickUrl(image));
  if (!url) return null;
  const focal = (image && typeof image === 'object') ? image.focal : null;
  const crop = (image && typeof image === 'object') ? image.crop : null;
  return {
    url,
    variants: readVariants(image),
    focal: focal || { ...DEFAULT_FOCAL },
    crop: crop || null,
    is_primary: !!(image && image.is_primary),
    sort_order: (image && image.sort_order) || 0,
  };
}

export function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images.map(normalizeImage).filter(Boolean);
}

// ── Cloudflare on-the-fly image resizing ─────────────────────────────────────
// AURA's product images live on Cloudflare R2 behind its own image domain.
// Rather than ship a multi-MB original to a 200px grid slot, route the URL
// through Cloudflare's image-resizing endpoint (/cdn-cgi/image/<opts>/<orig>).
// Cloudflare resizes once, re-encodes to AVIF/WebP, and edge-caches each size.
//
// Requires "Image Resizing / Transformations" enabled on the AURA Cloudflare
// zone. Guarded: we only rewrite URLs on AURA's own image host(s), and the
// CF_IMAGE_RESIZE flag instantly reverts to originals if it's ever disabled.
const CF_IMAGE_RESIZE = String(import.meta.env?.VITE_CF_IMAGE_RESIZE ?? 'true') === 'true';

// Hosts whose images can be safely routed through Cloudflare resizing.
// Set this to AURA's own R2 custom image domain. Configurable via Vite env
// (VITE_CF_RESIZE_HOSTS, comma-separated); defaults to images.aura-lb.shop.
const CF_RESIZE_HOSTS = new Set(
  (import.meta.env?.VITE_CF_RESIZE_HOSTS || 'images.aura-lb.shop')
    .split(',').map(s => s.trim()).filter(Boolean)
);

const CF_SIZE_WIDTH = { thumb: 320, card: 600, large: 1200 };

function cfResize(url, size) {
  if (!CF_IMAGE_RESIZE || !url) return url;
  if (!/^https?:\/\//i.test(url)) return url;            // skip data:/blob:/relative
  if (url.includes('/cdn-cgi/image/')) return url;        // already transformed
  let u;
  try { u = new URL(url); } catch { return url; }
  if (!CF_RESIZE_HOSTS.has(u.host)) return url;           // only our R2 host
  const width = CF_SIZE_WIDTH[size] || CF_SIZE_WIDTH.card;
  const opts = `width=${width},quality=80,format=auto,fit=scale-down`;
  return `${u.origin}/cdn-cgi/image/${opts}${u.pathname}${u.search}`;
}

// Pick the best URL for a desired size from a normalized image.
//   size: 'large' | 'card' | 'thumb' (default 'card')
export function imageSrc(normalized, size = 'card') {
  if (!normalized) return '';
  const norm = typeof normalized === 'string' ? normalizeImage(normalized) : normalized;
  if (!norm) return '';
  const v = norm.variants;
  if (v) {
    const order = {
      large: ['large', 'card', 'thumb'],
      card: ['card', 'large', 'thumb'],
      thumb: ['thumb', 'card', 'large'],
    }[size] || ['card', 'large', 'thumb'];
    for (const k of order) if (v[k]) return v[k];
  }
  return cfResize(norm.url, size);
}

// CMS sections / category icons store only a single canonical `image_url` string
// (the 600px card.webp derivative). cmsImageSrc right-sizes it: swap to the
// sibling derivative for the requested size when it's one of ours, then route
// through Cloudflare resizing as a final tightener.
export function cmsImageSrc(rawUrl, size = 'large') {
  const url = resolveImageUrl(typeof rawUrl === 'object' ? pickUrl(rawUrl) : rawUrl);
  if (!url) return '';
  const swapped = url.replace(/\/(large|card|thumb)\.webp(\?.*)?$/i,
    (_m, _old, q) => `/${size}.webp${q || ''}`);
  return cfResize(swapped, size);
}

// Neutral inline placeholder so a dead/missing image never shows the browser's
// broken-image icon.
export const IMAGE_PLACEHOLDER =
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160">` +
    `<rect width="120" height="160" fill="#f1ece4"/>` +
    `<g fill="none" stroke="#c9bba9" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">` +
    `<path d="M44 64h32l6 44a8 8 0 0 1-8 9H46a8 8 0 0 1-8-9z"/>` +
    `<path d="M50 64v-6a10 10 0 0 1 20 0v6"/></g></svg>`,
  );

export function handleImageError(e) {
  const img = e.currentTarget;
  if (img.dataset.fallbackApplied) return;
  img.dataset.fallbackApplied = '1';
  img.src = IMAGE_PLACEHOLDER;
}
