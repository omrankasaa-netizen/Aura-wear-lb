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
