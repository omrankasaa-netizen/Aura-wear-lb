import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { frameImageStyle, cmsImageSrc, handleImageError } from '@/lib/imageFraming';

// Fixed 3:4 portrait image area for a product card.
//
// `images` is an array of { url, focal?, crop?, alt? }. With more than one image
// the customer can browse all photos directly on the grid card:
//   - prev/next arrows + dot indicators (appear on hover desktop, always on touch)
//   - horizontal swipe on touch
// Each photo is center-cropped to 3:4 and honors its own focal/crop metadata.
// Single-image products render no controls. Arrows/dots stopPropagation so they
// never trigger the parent <Link> navigation.
export default function CardImageCarousel({ images, fallbackAlt = '', rtl = false, jumpToIndex = null, onImageClick = null }) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(null);

  // Allow a parent (e.g. a color swatch on the card) to drive which photo shows.
  useEffect(() => {
    if (jumpToIndex != null && jumpToIndex >= 0) setIndex(jumpToIndex);
  }, [jumpToIndex]);

  const pics = (images || []).filter(im => im && im.url);
  const count = pics.length;
  const multiple = count > 1;

  const safeIndex = Math.min(index, Math.max(0, count - 1));
  const current = pics[safeIndex];

  function go(delta, e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setIndex(i => {
      const n = (i + delta + count) % count;
      return n;
    });
  }

  // RTL: visual "next" arrow on the left should advance forward.
  const prevDelta = rtl ? 1 : -1;
  const nextDelta = rtl ? -1 : 1;

  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX.current == null || !multiple) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) {
      // Swipe left -> next (in LTR); mirrored for RTL.
      const forward = dx < 0;
      go(rtl ? (forward ? -1 : 1) : (forward ? 1 : -1));
    }
    touchStartX.current = null;
  }

  if (count === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-secondary">
        <img src="/brand/aura-mark.png" alt="" className="w-10 h-10 opacity-20" />
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0"
      onTouchStart={multiple ? onTouchStart : undefined}
      onTouchEnd={multiple ? onTouchEnd : undefined}
    >
      <img
        src={current.variants ? (current.variants.card || current.url) : cmsImageSrc(current.url, 'card')}
        alt={current.alt || fallbackAlt}
        loading="lazy"
        decoding="async"
        onError={handleImageError}
        onClick={onImageClick ? (e) => { e.preventDefault(); e.stopPropagation(); onImageClick(safeIndex); } : undefined}
        // Hover-zoom only on devices that truly hover (hover-zoom would otherwise
        // "stick" after a tap on touch screens and push the image out of frame).
        className={`select-none transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-105 ${onImageClick ? 'cursor-zoom-in' : ''}`}
        style={frameImageStyle(current.focal, current.crop)}
        draggable={false}
      />

      {multiple && (
        <>
          {/* Arrows: hover on desktop, always visible on touch */}
          <button
            type="button"
            aria-label="Previous image"
            onClick={(e) => go(prevDelta, e)}
            className="absolute top-1/2 -translate-y-1/2 left-1.5 w-7 h-7 flex items-center justify-center bg-background/85 backdrop-blur rounded-full shadow-sm opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-background z-10"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={(e) => go(nextDelta, e)}
            className="absolute top-1/2 -translate-y-1/2 right-1.5 w-7 h-7 flex items-center justify-center bg-background/85 backdrop-blur rounded-full shadow-sm opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-background z-10"
          >
            <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
          </button>

          {/* Dots */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
            {pics.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to image ${i + 1}`}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIndex(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === safeIndex ? 'bg-foreground' : 'bg-foreground/35'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
