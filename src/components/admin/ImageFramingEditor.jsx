import React, { useRef, useState } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Crosshair, RotateCcw } from 'lucide-react';
import { frameImageStyle, DEFAULT_FOCAL, clamp01, hasCrop } from '@/lib/imageFraming';

// Per-image admin editor controlling how a photo frames inside the 3:4 card.
// Emits normalized metadata (0..1) and never mutates the original asset:
//   focal: { x, y }                 - draggable point -> CSS object-position
//   crop:  { x, y, width, height }  - 3:4-constrained selection -> CSS transform
//
// `onChange({ focal, crop })` is called with the updated framing. A crop of null
// means "no crop" (use full image + focal). Renders a live 3:4 preview so the
// admin sees exactly what the storefront card will show.
export default function ImageFramingEditor({ url, focal, crop, onChange }) {
  const imgRef = useRef(null);
  const focalBoxRef = useRef(null);
  const [mode, setMode] = useState('focal'); // 'focal' | 'crop'
  const [pixelCrop, setPixelCrop] = useState(null); // react-image-crop working state
  const dragging = useRef(false);

  const curFocal = {
    x: clamp01(focal?.x ?? DEFAULT_FOCAL.x),
    y: clamp01(focal?.y ?? DEFAULT_FOCAL.y),
  };

  // ── Focal point dragging ───────────────────────────────────────────────────
  function updateFocalFromEvent(e) {
    const box = focalBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clamp01((clientX - rect.left) / rect.width);
    const y = clamp01((clientY - rect.top) / rect.height);
    onChange({ focal: { x, y }, crop: crop || null });
  }

  function onFocalDown(e) {
    if (mode !== 'focal') return;
    e.preventDefault();
    dragging.current = true;
    updateFocalFromEvent(e);
  }
  function onFocalMove(e) {
    if (!dragging.current) return;
    updateFocalFromEvent(e);
  }
  function onFocalUp() { dragging.current = false; }

  // ── Crop selection (constrained to 3:4) ────────────────────────────────────
  // Convert react-image-crop's percent crop into our normalized 0..1 model.
  function commitCrop(c) {
    if (!c || !c.width || !c.height) {
      onChange({ focal: curFocal, crop: null });
      return;
    }
    const next = {
      x: clamp01(c.x / 100),
      y: clamp01(c.y / 100),
      width: clamp01(c.width / 100),
      height: clamp01(c.height / 100),
    };
    onChange({ focal: curFocal, crop: hasCrop(next) ? next : null });
  }

  // Seed react-image-crop's UI from stored normalized crop (percent units).
  const initialPercentCrop = crop && hasCrop(crop)
    ? { unit: '%', x: clamp01(crop.x) * 100, y: clamp01(crop.y) * 100, width: clamp01(crop.width) * 100, height: clamp01(crop.height) * 100 }
    : undefined;

  function reset() {
    setPixelCrop(null);
    onChange({ focal: { ...DEFAULT_FOCAL }, crop: null });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setMode('focal')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${mode === 'focal' ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:text-foreground'}`}>
          <Crosshair className="w-3.5 h-3.5" /> Focal point
        </button>
        <button type="button" onClick={() => setMode('crop')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${mode === 'crop' ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:text-foreground'}`}>
          Crop 3:4
        </button>
        <button type="button" onClick={reset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground ml-auto">
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
        {/* Editor surface */}
        <div className="min-w-0">
          {mode === 'crop' ? (
            <ReactCrop
              crop={pixelCrop ?? initialPercentCrop}
              onChange={(c, percentCrop) => setPixelCrop(percentCrop)}
              onComplete={(c, percentCrop) => commitCrop(percentCrop)}
              aspect={3 / 4}
              keepSelection
              ruleOfThirds
            >
              <img ref={imgRef} src={url} alt="" className="max-h-72 w-auto rounded-lg select-none" />
            </ReactCrop>
          ) : (
            <div
              ref={focalBoxRef}
              onMouseDown={onFocalDown}
              onMouseMove={onFocalMove}
              onMouseUp={onFocalUp}
              onMouseLeave={onFocalUp}
              onTouchStart={onFocalDown}
              onTouchMove={onFocalMove}
              onTouchEnd={onFocalUp}
              className="relative inline-block rounded-lg overflow-hidden cursor-crosshair select-none"
            >
              <img src={url} alt="" className="max-h-72 w-auto block pointer-events-none select-none" draggable={false} />
              <div
                className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full border-2 border-white bg-primary/70 shadow ring-2 ring-primary pointer-events-none"
                style={{ left: `${curFocal.x * 100}%`, top: `${curFocal.y * 100}%` }}
              />
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {mode === 'crop'
              ? 'Drag a 3:4 selection. The card shows only this region (original image is untouched).'
              : 'Click or drag to set the focal point — the card centers the crop here.'}
          </p>
        </div>

        {/* Live 3:4 card preview */}
        <div className="shrink-0">
          <p className="text-[11px] text-muted-foreground mb-1.5 text-center">Card preview</p>
          <div className="relative w-28 aspect-[3/4] bg-secondary overflow-hidden rounded-sm border border-border">
            <img src={url} alt="" style={frameImageStyle(curFocal, crop)} draggable={false} />
          </div>
        </div>
      </div>
    </div>
  );
}
