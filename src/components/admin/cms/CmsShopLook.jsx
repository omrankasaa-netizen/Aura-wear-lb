import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, X, Plus, Trash2, ChevronUp, ChevronDown, LayoutGrid, Megaphone } from 'lucide-react';

/* ─── Shared helpers ─────────────────────────────────── */
function Toggle({ value, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <span className="text-xs text-muted-foreground">{value ? 'Visible' : 'Hidden'}</span>
      <div onClick={() => onChange(!value)}
        className={`w-10 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${value ? 'bg-primary' : 'bg-muted'}`}>
        <div className={`w-4 h-4 m-0.5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
      </div>
    </label>
  );
}

async function uploadImage(file) {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return file_url;
}

function ImageField({ url, onUpload, onRemove, label = 'Image' }) {
  const [loading, setLoading] = useState(false);
  async function handle(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLoading(true);
    try { const u = await uploadImage(f); if (u) onUpload(u); }
    finally { setLoading(false); e.target.value = ''; }
  }
  return (
    <div className="flex items-center gap-2">
      {url && <img src={url} alt="" className="w-16 h-10 object-cover rounded-lg border border-border" />}
      <label className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground cursor-pointer hover:bg-muted">
        <Upload className="w-3 h-3" /> {loading ? 'Uploading…' : label}
        <input type="file" accept="image/*" className="hidden" disabled={loading} onChange={handle} />
      </label>
      {url && onRemove && (
        <button type="button" onClick={onRemove} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Remove image">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function Bilingual({ en, ar, onEn, onAr, labelEn, labelAr, multiline = false }) {
  const C = multiline ? 'textarea' : 'input';
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">{labelEn}</label>
        <C value={en} onChange={e => onEn(e.target.value)} rows={2}
          className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs resize-none" />
      </div>
      <div dir="rtl">
        <label className="text-xs text-muted-foreground block mb-1">{labelAr}</label>
        <C value={ar} onChange={e => onAr(e.target.value)} rows={2}
          className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs resize-none" />
      </div>
    </div>
  );
}

function SaveBtn({ saving, saved, onClick }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
      {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save'}
    </button>
  );
}

/* ─── SECTION A — Build Your Fit + category grid ─────── */
function ShopTheLookPanel({ section, onSave }) {
  const [form, setForm] = useState({
    overline: '', overline_ar: '', title: '', title_ar: '',
    button_label: '', button_label_ar: '', image_url: '', link_url: '',
    tiles: [], is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!section) return;
    let tiles = [];
    try { tiles = section.tiles_json ? JSON.parse(section.tiles_json) : []; } catch { tiles = []; }
    setForm({
      overline: section.overline || '', overline_ar: section.overline_ar || '',
      title: section.title || '', title_ar: section.title_ar || '',
      button_label: section.button_label || '', button_label_ar: section.button_label_ar || '',
      image_url: section.image_url || '', link_url: section.link_url || '',
      tiles: Array.isArray(tiles) ? tiles : [],
      is_active: section.is_active !== false,
    });
  }, [section]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function setTile(i, k, v) {
    setForm(f => ({ ...f, tiles: f.tiles.map((t, idx) => idx === i ? { ...t, [k]: v } : t) }));
  }
  function addTile() {
    setForm(f => ({ ...f, tiles: [...f.tiles, { title: '', title_ar: '', link: '', image_url: '' }] }));
  }
  function removeTile(i) {
    setForm(f => ({ ...f, tiles: f.tiles.filter((_, idx) => idx !== i) }));
  }
  function moveTile(i, dir) {
    setForm(f => {
      const j = i + dir;
      if (j < 0 || j >= f.tiles.length) return f;
      const tiles = [...f.tiles];
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
      return { ...f, tiles };
    });
  }

  async function save() {
    setSaving(true);
    try {
      const { tiles, ...rest } = form;
      await onSave('home_shop_the_look', {
        ...rest,
        tiles_json: JSON.stringify(tiles || []),
        sort_order: 40,
      });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-primary" />
          <div>
            <h2 className="font-heading font-semibold text-foreground">Build Your Fit + Category Grid</h2>
            <p className="text-xs text-muted-foreground">Feature panel on the left, category tiles on the right.</p>
          </div>
        </div>
        <Toggle value={form.is_active} onChange={v => setF('is_active', v)} />
      </div>

      {/* Feature panel */}
      <div className="space-y-3 border border-border rounded-xl p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feature Panel</h3>
        <Bilingual en={form.overline} ar={form.overline_ar} onEn={v => setF('overline', v)} onAr={v => setF('overline_ar', v)}
          labelEn="Overline (EN)" labelAr="النص العلوي (AR)" />
        <Bilingual en={form.title} ar={form.title_ar} onEn={v => setF('title', v)} onAr={v => setF('title_ar', v)}
          labelEn="Headline (EN)" labelAr="العنوان (AR)" />
        <Bilingual en={form.button_label} ar={form.button_label_ar} onEn={v => setF('button_label', v)} onAr={v => setF('button_label_ar', v)}
          labelEn="Button Label (EN)" labelAr="زر (AR)" />
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Button Link URL</label>
          <input value={form.link_url} onChange={e => setF('link_url', e.target.value)} placeholder="/shop?category=matching-sets"
            className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Background Image</label>
          <ImageField url={form.image_url} onUpload={u => setF('image_url', u)} onRemove={() => setF('image_url', '')} />
        </div>
      </div>

      {/* Tiles */}
      <div className="space-y-3 border border-border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category Tiles</h3>
          <button onClick={addTile}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-semibold">
            <Plus className="w-3.5 h-3.5" /> Add Tile
          </button>
        </div>
        {form.tiles.length === 0 && (
          <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            No tiles yet. Add one to show a category tile.
          </div>
        )}
        <div className="space-y-2">
          {form.tiles.map((tile, i) => (
            <div key={i} className="bg-background border border-border rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground shrink-0">#{i + 1}</span>
                <span className="flex-1 text-xs font-medium text-foreground truncate">{tile.title || 'Untitled tile'}</span>
                <button onClick={() => moveTile(i, -1)} disabled={i === 0}
                  className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30" aria-label="Move up">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => moveTile(i, 1)} disabled={i === form.tiles.length - 1}
                  className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30" aria-label="Move down">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => removeTile(i)}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Remove tile">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <Bilingual en={tile.title} ar={tile.title_ar} onEn={v => setTile(i, 'title', v)} onAr={v => setTile(i, 'title_ar', v)}
                labelEn="Title (EN)" labelAr="العنوان (AR)" />
              <input value={tile.link || ''} onChange={e => setTile(i, 'link', e.target.value)} placeholder="Link URL e.g. /shop?category=t-shirts"
                className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
              <ImageField url={tile.image_url} label="Tile Photo"
                onUpload={u => setTile(i, 'image_url', u)} onRemove={() => setTile(i, 'image_url', '')} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <SaveBtn saving={saving} saved={saved} onClick={save} />
      </div>
    </div>
  );
}

/* ─── SECTION B — Promo / Offer Banner ───────────────── */
function OfferBannerPanel({ section, onSave }) {
  const [form, setForm] = useState({
    overline: '', overline_ar: '', title: '', title_ar: '',
    body: '', body_ar: '', button_label: '', button_label_ar: '',
    image_url: '', link_url: '', is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!section) return;
    setForm({
      overline: section.overline || '', overline_ar: section.overline_ar || '',
      title: section.title || '', title_ar: section.title_ar || '',
      body: section.body || '', body_ar: section.body_ar || '',
      button_label: section.button_label || '', button_label_ar: section.button_label_ar || '',
      image_url: section.image_url || '', link_url: section.link_url || '',
      is_active: section.is_active !== false,
    });
  }, [section]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    try {
      await onSave('home_offer_banner', { ...form, sort_order: 50 });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary" />
          <div>
            <h2 className="font-heading font-semibold text-foreground">Promo Banner</h2>
            <p className="text-xs text-muted-foreground">Full-width offer banner lower on the homepage.</p>
          </div>
        </div>
        <Toggle value={form.is_active} onChange={v => setF('is_active', v)} />
      </div>

      <Bilingual en={form.overline} ar={form.overline_ar} onEn={v => setF('overline', v)} onAr={v => setF('overline_ar', v)}
        labelEn="Overline (EN)" labelAr="النص العلوي (AR)" />
      <Bilingual en={form.title} ar={form.title_ar} onEn={v => setF('title', v)} onAr={v => setF('title_ar', v)}
        labelEn="Heading (EN)" labelAr="العنوان (AR)" />
      <Bilingual en={form.body} ar={form.body_ar} onEn={v => setF('body', v)} onAr={v => setF('body_ar', v)}
        labelEn="Subtext (EN)" labelAr="النص الفرعي (AR)" multiline />
      <Bilingual en={form.button_label} ar={form.button_label_ar} onEn={v => setF('button_label', v)} onAr={v => setF('button_label_ar', v)}
        labelEn="Button Label (EN)" labelAr="زر (AR)" />
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Button Link URL</label>
        <input value={form.link_url} onChange={e => setF('link_url', e.target.value)} placeholder="/shop?category=offers"
          className="w-full px-2 py-1.5 rounded-lg border border-input bg-background text-xs" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Background Image</label>
        <ImageField url={form.image_url} onUpload={u => setF('image_url', u)} onRemove={() => setF('image_url', '')} />
      </div>

      {/* Preview */}
      <div className="relative rounded-xl overflow-hidden h-28 bg-charcoal">
        {form.image_url && <img src={form.image_url} alt="" className="w-full h-full object-cover opacity-60" />}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center px-4">
          {form.overline && <p className="text-[10px] uppercase tracking-widest opacity-70">{form.overline}</p>}
          {form.title && <p className="text-lg font-bold drop-shadow">{form.title}</p>}
          {form.body && <p className="text-xs opacity-80">{form.body}</p>}
        </div>
      </div>

      <div className="flex justify-end">
        <SaveBtn saving={saving} saved={saved} onClick={save} />
      </div>
    </div>
  );
}

/* ─── MAIN EXPORT ────────────────────────────────────── */
export default function CmsShopLook({ sectionMap, onSave }) {
  return (
    <div className="space-y-5">
      <ShopTheLookPanel section={sectionMap?.home_shop_the_look} onSave={onSave} />
      <OfferBannerPanel section={sectionMap?.home_offer_banner} onSave={onSave} />
    </div>
  );
}
