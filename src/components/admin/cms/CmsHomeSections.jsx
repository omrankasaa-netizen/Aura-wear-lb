import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, X, Instagram } from 'lucide-react';

// Instagram strip editor. Backed by a CmsSection row keyed 'home_instagram'.
// The storefront strip reads gallery_json (a JSON string array of image URLs)
// and renders those photos. These do NOT sync from Instagram — they are the
// images the admin manually uploads here. Leaving fields blank uses defaults.
export default function CmsHomeSections({ sectionMap, onSave }) {
  const section = sectionMap?.home_instagram;
  const [form, setForm] = useState({
    title: '', title_ar: '', body: '', body_ar: '',
    link_url: '', gallery: [], is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (section) {
      let gallery = [];
      try { gallery = section.gallery_json ? JSON.parse(section.gallery_json) : []; } catch { gallery = []; }
      setForm({
        title: section.title || '',
        title_ar: section.title_ar || '',
        body: section.body || '',
        body_ar: section.body_ar || '',
        link_url: section.link_url || '',
        gallery: Array.isArray(gallery) ? gallery : [],
        is_active: section.is_active !== false,
      });
    }
  }, [section]);

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Upload one or more photos (capped at 6); append resulting URLs to gallery.
  async function handleGalleryUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const current = form.gallery || [];
      const room = Math.max(0, 6 - current.length);
      const next = [...current];
      for (const file of files.slice(0, room)) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (file_url) next.push(file_url);
      }
      setF('gallery', next);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function removeGalleryImage(idx) {
    setF('gallery', (form.gallery || []).filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { gallery, ...rest } = form;
      await onSave('home_instagram', {
        ...rest,
        section_key: 'home_instagram',
        gallery_json: JSON.stringify(gallery || []),
        sort_order: 60,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Instagram className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-heading font-semibold text-foreground">Instagram Strip</h2>
              <p className="text-xs text-muted-foreground">The "On the feed" block on the homepage.</p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-muted-foreground">Visible</span>
            <div onClick={() => setF('is_active', !form.is_active)}
              className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${form.is_active ? 'bg-primary' : 'bg-muted'}`}>
              <div className={`w-4 h-4 m-0.5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : ''}`} />
            </div>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Heading (EN)</label>
            <input value={form.title} onChange={e => setF('title', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="On the feed" />
          </div>
          <div dir="rtl">
            <label className="text-xs text-muted-foreground block mb-1">العنوان (AR)</label>
            <input value={form.title_ar} onChange={e => setF('title_ar', e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm font-body" placeholder="على الإنستغرام" />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Instagram profile URL</label>
          <input value={form.link_url} onChange={e => setF('link_url', e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" placeholder="https://instagram.com/your.handle" />
        </div>

        {/* Gallery */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Strip photos</label>
          <p className="text-xs text-muted-foreground mb-2">
            Photos shown in the strip (up to 6). These do NOT sync from Instagram — upload the images you want to show here.
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
            {(form.gallery || []).map((url, i) => (
              <div key={i} className="relative group aspect-square">
                <img src={url} alt="" className="w-full h-full rounded-xl object-cover border border-border" />
                <button type="button" onClick={() => removeGalleryImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                  aria-label="Remove photo">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {(form.gallery || []).length === 0 && (
              <p className="col-span-full text-xs text-muted-foreground italic">No photos yet — the strip shows placeholders until you add some.</p>
            )}
          </div>
          {(form.gallery || []).length < 6 && (
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border bg-muted hover:bg-muted/70 cursor-pointer text-sm text-muted-foreground">
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading…' : `Add photos (${(form.gallery || []).length}/6)`}
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} disabled={uploading} />
            </label>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
