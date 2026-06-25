import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { logAction } from '@/lib/auditLog';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { X, Upload, Star, Trash2, ImageIcon, Crop as CropIcon } from 'lucide-react';
import ImageFramingEditor from './ImageFramingEditor';
import { frameImageStyle } from '@/lib/imageFraming';

// Adult apparel sizing (Aura is an adult fashion store).
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const COLORS_DEFAULT = ['White', 'Black', 'Beige', 'Cream', 'Navy', 'Blue', 'Olive', 'Grey', 'Brown', 'Green', 'Red', 'Stone', 'Khaki', 'Charcoal'];

function ChipInput({ label, chips, setChips, suggestions }) {
  const [input, setInput] = useState('');
  function add(val) {
    const v = val.trim();
    if (v && !chips.includes(v)) setChips([...chips, v]);
    setInput('');
  }
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1.5">{label}</label>
      <div className="min-h-[42px] border border-input bg-background rounded-xl px-3 py-2 flex flex-wrap gap-1.5">
        {chips.map(c => (
          <span key={c} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2.5 py-1 rounded-full">
            {c}
            <button type="button" onClick={() => setChips(chips.filter(x => x !== c))} className="hover:text-destructive">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input); } }}
          onBlur={() => input && add(input)}
          placeholder={chips.length === 0 ? 'Type and press Enter…' : ''}
          className="bg-transparent outline-none text-xs flex-1 min-w-[80px] text-foreground placeholder:text-muted-foreground"
        />
      </div>
      {suggestions && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {suggestions.filter(s => !chips.includes(s)).slice(0, 8).map(s => (
            <button key={s} type="button" onClick={() => setChips([...chips, s])}
              className="text-xs text-muted-foreground hover:text-primary border border-border rounded-full px-2 py-0.5 hover:border-primary transition-colors">
              +{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1.5">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ className = '', ...props }) {
  return (
    <input {...props} className={`w-full px-3 py-2 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring ${className}`} />
  );
}

function Textarea({ className = '', ...props }) {
  return (
    <textarea {...props} className={`w-full px-3 py-2 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring resize-none ${className}`} />
  );
}

function Select({ children, className = '', ...props }) {
  return (
    <select {...props} className={`w-full px-3 py-2 rounded-xl border border-input bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-ring ${className}`}>
      {children}
    </select>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div onClick={onChange} className={`w-10 h-5 rounded-full transition-colors relative ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

export default function ProductForm({ product, categories, onClose, onSaved, cloneSourceId = null, products = [] }) {
  const { currentUser, hasRole } = useAuthUser();
  const canSeeCost = hasRole('super_admin');
  const isNew = !product?.id;
  const isClone = isNew && !!cloneSourceId;
  // When cloning, variants/images are read from the SOURCE product but seeded as
  // brand-new (ids stripped) so saving creates fresh rows without touching it.
  const sourceId = product?.id || cloneSourceId || null;
  const fileInputRef = useRef();
  // Seed the editable grid/images from the DB exactly once per opened product.
  // The global query client uses staleTime:0 + refetchOnWindowFocus, so a
  // background refetch (e.g. tabbing away and back) would otherwise re-run the
  // init effect and clobber the admin's in-progress edits.
  const variantsInitRef = useRef(null);
  const imagesInitRef = useRef(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    slug: '', sku: '', name: '', name_ar: '',
    short_description: '', short_description_ar: '',
    description: '', description_ar: '',
    category_id: '', subcategory_id: '', collection_ids: '', collection_id: '', gender: '', age_group: '',
    price_usd: '', compare_at_price_usd: '', cost_usd: '',
    tags: '', is_new: false, is_featured: false, status: 'Active',
    has_variants: false, stock_quantity: 0, reorder_level: 3,
    ...product,
  });

  const [sizes, setSizes] = useState([]);
  const [colors, setColors] = useState([]);
  const [variantGrid, setVariantGrid] = useState({});
  const [images, setImages] = useState([]); // { url, is_primary, sort_order, id?, isNew?, focal?, crop? }
  const [editingImageIdx, setEditingImageIdx] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('basic'); // basic | variants | images | preview

  // Load existing variants & images (from the SOURCE when cloning)
  const { data: existingVariants = [], isFetched: variantsFetched } = useQuery({
    queryKey: ['form-variants', sourceId],
    queryFn: () => base44.entities.ProductVariant.filter({ product_id: sourceId }),
    enabled: !!sourceId,
  });

  const { data: existingImages = [], isFetched: imagesFetched } = useQuery({
    queryKey: ['form-images', sourceId],
    queryFn: () => base44.entities.ProductImage.filter({ product_id: sourceId }),
    enabled: !!sourceId,
  });

  const { data: collections = [] } = useQuery({
    queryKey: ['admin-collections'],
    queryFn: () => base44.entities.Collection.list('name', 50),
  });

  // Subcategories for selected parent category
  const subcategories = categories.filter(c => c.parent_id === form.category_id);
  const parentCategories = categories.filter(c => !c.parent_id);

  // Selected collection IDs as array
  const selectedCollectionIds = (form.collection_ids || '').split(',').map(s => s.trim()).filter(Boolean);

  // True when `sku` collides with another product (any product except the one
  // being edited). Used to block save on create/clone and to flag the field.
  function skuExists(sku) {
    const s = (sku || '').trim().toLowerCase();
    if (!s) return false;
    return products.some(p => p.id !== product?.id && (p.sku || '').trim().toLowerCase() === s);
  }
  const skuCollision = skuExists(form.sku);

  useEffect(() => {
    // Only seed once per source; ignore later background refetches so we don't
    // overwrite edits the admin has made but not yet saved.
    if (!variantsFetched || variantsInitRef.current === (sourceId ?? null)) return;
    variantsInitRef.current = sourceId ?? null;
    if (existingVariants.length > 0) {
      const uniqueSizes = [...new Set(existingVariants.map(v => v.size).filter(Boolean))];
      const uniqueColors = [...new Set(existingVariants.map(v => v.color).filter(Boolean))];
      setSizes(uniqueSizes);
      setColors(uniqueColors);
      const grid = {};
      for (const v of existingVariants) {
        const key = `${v.size || ''}__${v.color || ''}`;
        // Clone: drop the source row id so save creates a fresh variant row.
        grid[key] = { qty: v.qty_on_hand || 0, id: isClone ? undefined : v.id, sku: v.variant_sku };
      }
      setVariantGrid(grid);
    }
  }, [variantsFetched, existingVariants, sourceId, isClone]);

  useEffect(() => {
    if (!imagesFetched || imagesInitRef.current === (sourceId ?? null)) return;
    imagesInitRef.current = sourceId ?? null;
    if (existingImages.length > 0) {
      const sorted = [...existingImages].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      // Clone: strip ids and mark new so images are recreated for the new
      // product (same URLs reused) rather than re-pointing the source's rows.
      setImages(isClone ? sorted.map(img => ({ ...img, id: undefined, isNew: true })) : sorted);
    }
  }, [imagesFetched, existingImages, sourceId, isClone]);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function variantKey(size, color) { return `${size}__${color}`; }

  function setVariantQty(size, color, qty) {
    setVariantGrid(g => ({ ...g, [variantKey(size, color)]: { ...(g[variantKey(size, color)] || {}), qty: Number(qty) } }));
  }

  async function handleImageUpload(files) {
    setUploading(true);
    for (const file of files) {
      const res = await base44.integrations.Core.UploadFile({ file });
      const file_url = res.file_url || res.url;
      setImages(imgs => [
        ...imgs,
        { url: file_url, variants: res.variants || null, is_primary: imgs.length === 0, sort_order: imgs.length, isNew: true }
      ]);
    }
    setUploading(false);
  }

  function setPrimary(idx) {
    setImages(imgs => imgs.map((img, i) => ({ ...img, is_primary: i === idx })));
  }

  function removeImage(idx) {
    setImages(imgs => imgs.filter((_, i) => i !== idx));
    setEditingImageIdx(null);
  }

  function setImageFraming(idx, { focal, crop }) {
    setImages(imgs => imgs.map((img, i) => i === idx ? { ...img, focal, crop } : img));
  }

  function setImageColor(idx, color) {
    setImages(imgs => imgs.map((img, i) => i === idx ? { ...img, color } : img));
  }

  async function handleSave() {
    if (!form.name || !form.price_usd) { setError('Name and price are required.'); return; }
    if (isClone && !(form.sku || '').trim()) { setError('A unique SKU is required before saving the duplicate.'); return; }
    if (skuCollision) { setError('That SKU is already used by another product. Choose a unique SKU.'); return; }
    setSaving(true);
    setError('');
    try {
      // Clone: always derive the slug from the (validated, unique) SKU so the
      // duplicate gets its own handle instead of colliding with the source.
      const slugBase = isClone ? (form.sku || form.name) : (form.slug || form.name);
      const slug = slugBase.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const payload = {
        ...form,
        slug,
        price_usd: Number(form.price_usd),
        compare_at_price_usd: form.compare_at_price_usd ? Number(form.compare_at_price_usd) : null,
        cost_usd: form.cost_usd ? Number(form.cost_usd) : null,
        stock_quantity: form.has_variants ? 0 : Number(form.stock_quantity || 0),
        // Persist the variant sizes/colors as pipe-joined strings on the product.
        // The storefront product page renders its size/color pickers from these
        // strings, so without writing them here a variant product would show NO
        // pickers and could never be added to cart. Empty when no variants.
        sizes: form.has_variants ? sizes.join('|') : '',
        colors: form.has_variants ? colors.join('|') : '',
      };
      // Cost is super-admin-only money; never let a non-super write/overwrite it.
      if (!canSeeCost) delete payload.cost_usd;

      let productId;
      if (isNew) {
        const created = await base44.entities.Product.create(payload);
        productId = created.id;
      } else {
        await base44.entities.Product.update(product.id, payload);
        productId = product.id;
      }

      // Reconcile variants so the editor is the source of truth. We upsert every
      // size/color the admin currently has, then delete any leftover rows. This
      // fixes three bugs: (1) removed sizes/colors persisted because they were
      // never deleted and reappeared on reload; (2) the full size×color grid
      // materialised phantom 0-qty rows for combinations that never existed;
      // (3) duplicate/orphan rows from earlier imports inflated the stock total.
      // We re-read the DB rows (not the possibly-stale query cache) so orphans
      // created by a prior save in the same session are cleaned up too.
      const keyFor = (size, color) => `${size || ''}__${color || ''}`;
      const dbVariants = await base44.entities.ProductVariant.filter({ product_id: productId });
      const desiredKeys = new Set();
      const keptIds = new Set();

      if (form.has_variants && (sizes.length > 0 || colors.length > 0)) {
        const pairs = sizes.length > 0 && colors.length > 0
          ? sizes.flatMap(s => colors.map(c => ({ size: s, color: c })))
          : sizes.length > 0
            ? sizes.map(s => ({ size: s, color: '' }))
            : colors.map(c => ({ size: '', color: c }));

        for (const { size, color } of pairs) {
          const key = variantKey(size, color);
          const entry = variantGrid[key] || { qty: 0 };
          const qty = Number(entry.qty) || 0;
          const sku = `${payload.sku || slug}-${size || color}`.toUpperCase();
          if (entry.id) {
            await base44.entities.ProductVariant.update(entry.id, { qty_on_hand: qty });
            desiredKeys.add(keyFor(size, color));
            keptIds.add(entry.id);
          } else if (qty > 0) {
            // Only create a row when it carries stock — never materialise an
            // empty phantom combo just because the grid renders the cell.
            const created = await base44.entities.ProductVariant.create({
              product_id: productId, variant_sku: sku, size, color, qty_on_hand: qty,
            });
            desiredKeys.add(keyFor(size, color));
            keptIds.add(created.id);
          }
        }
      }

      // Remove rows the admin no longer has: variants whose size/color is gone,
      // duplicate rows that share a kept key but a different id, everything when
      // has_variants is toggled off, and any pre-existing orphans.
      for (const v of dbVariants) {
        if (!desiredKeys.has(keyFor(v.size, v.color)) || !keptIds.has(v.id)) {
          await base44.entities.ProductVariant.delete(v.id);
        }
      }

      // Save images
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        // `color` links a photo to a variant color so the storefront card can
        // swap the image when a shopper picks that color (optional; '' = none).
        const imgPayload = { product_id: productId, url: img.url, variants: img.variants ?? null, is_primary: img.is_primary, sort_order: i, alt: form.name, alt_ar: form.name_ar, focal: img.focal ?? null, crop: img.crop ?? null, color: img.color || '' };
        if (img.id && !img.isNew) {
          await base44.entities.ProductImage.update(img.id, imgPayload);
        } else if (img.isNew || !img.id) {
          await base44.entities.ProductImage.create(imgPayload);
        }
      }

      await logAction({ action: isNew ? 'created' : 'updated', entity: 'Product', entityId: productId, userName: currentUser?.email });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Preview card ─────────────────────────────────────────────────────────────
  const primaryImageObj = images.find(i => i.is_primary) || images[0];
  const primaryImg = primaryImageObj?.url;

  const tabs = [
    { key: 'basic', label: 'Basic Info' },
    { key: 'variants', label: 'Variants & Stock' },
    { key: 'images', label: 'Images' },
    { key: 'preview', label: 'Preview' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 lg:p-6">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[95vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="font-heading font-bold text-foreground text-lg">{isClone ? 'Duplicate Product' : isNew ? 'Add Product' : 'Edit Product'}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 border-b border-border shrink-0 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors border-b-2 -mb-px ${tab === t.key ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── BASIC INFO ── */}
          {tab === 'basic' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name (English)" required>
                  <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Soft Bodysuit" />
                </Field>
                <Field label="اسم المنتج (عربي)">
                  <Input value={form.name_ar} onChange={e => set('name_ar', e.target.value)} placeholder="مثلاً: بودي سوفت" dir="rtl" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="SKU" required={isClone}>
                  <Input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="e.g. BODY-WH-NB"
                    className={skuCollision ? 'border-destructive' : ''} />
                  {skuCollision
                    ? <p className="text-xs text-destructive mt-1">This SKU is already used by another product.</p>
                    : isClone && <p className="text-xs text-muted-foreground mt-1">Set a unique SKU for the duplicate before saving.</p>}
                </Field>
                <Field label="Slug"><Input value={form.slug} onChange={e => set('slug', e.target.value)} placeholder={isClone ? 'auto-generated from SKU' : 'auto-generated from name'} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Short Description">
                  <Textarea value={form.short_description} onChange={e => set('short_description', e.target.value)} rows={2} placeholder="One-line product pitch…" />
                </Field>
                <Field label="وصف مختصر">
                  <Textarea value={form.short_description_ar} onChange={e => set('short_description_ar', e.target.value)} rows={2} dir="rtl" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Full Description">
                  <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={4} />
                </Field>
                <Field label="وصف كامل">
                  <Textarea value={form.description_ar} onChange={e => set('description_ar', e.target.value)} rows={4} dir="rtl" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Category">
                  <Select value={form.category_id} onChange={e => { set('category_id', e.target.value); set('subcategory_id', ''); }}>
                    <option value="">— Select —</option>
                    {parentCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Subcategory">
                  <Select value={form.subcategory_id || ''} onChange={e => set('subcategory_id', e.target.value)} disabled={subcategories.length === 0}>
                    <option value="">— None —</option>
                    {subcategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Gender">
                  <Select value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="">— Select —</option>
                    {['Women','Men','Unisex'].map(g => <option key={g}>{g}</option>)}
                  </Select>
                </Field>
                <Field label="Age Group">
                  <Select value={form.age_group} onChange={e => set('age_group', e.target.value)}>
                    <option value="">— Select —</option>
                    {['Adults','Teens'].map(a => <option key={a}>{a}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Price (USD)" required>
                  <Input type="number" step="0.01" min="0" value={form.price_usd} onChange={e => set('price_usd', e.target.value)} placeholder="0.00" />
                </Field>
                <Field label="Compare At (USD)">
                  <Input type="number" step="0.01" min="0" value={form.compare_at_price_usd || ''} onChange={e => set('compare_at_price_usd', e.target.value)} placeholder="0.00" />
                </Field>
                {canSeeCost && (
                  <Field label="Cost (USD)">
                    <Input type="number" step="0.01" min="0" value={form.cost_usd || ''} onChange={e => set('cost_usd', e.target.value)} placeholder="0.00" />
                  </Field>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Tags (comma-separated)">
                  <Input value={form.tags || ''} onChange={e => set('tags', e.target.value)} placeholder="organic, gift, summer" />
                </Field>
                <Field label="Collections">
                  <div className="min-h-[42px] border border-input bg-background rounded-xl px-2 py-1.5 flex flex-wrap gap-1.5">
                    {selectedCollectionIds.map(id => {
                      const col = collections.find(c => c.id === id);
                      return col ? (
                        <span key={id} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
                          {col.name}
                          <button type="button" onClick={() => set('collection_ids', selectedCollectionIds.filter(x => x !== id).join(','))} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                        </span>
                      ) : null;
                    })}
                    <select value="" onChange={e => { if (e.target.value && !selectedCollectionIds.includes(e.target.value)) set('collection_ids', [...selectedCollectionIds, e.target.value].join(',')); }}
                      className="bg-transparent outline-none text-xs text-muted-foreground flex-1 min-w-[80px] cursor-pointer">
                      <option value="">+ Add…</option>
                      {collections.filter(c => !selectedCollectionIds.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Status">
                  <Select value={form.status} onChange={e => set('status', e.target.value)}>
                    <option>Active</option>
                    <option>Hidden</option>
                  </Select>
                </Field>
                <Field label="Reorder Level">
                  <Input type="number" min="0" value={form.reorder_level || 3} onChange={e => set('reorder_level', e.target.value)} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-6 pt-1">
                <Toggle label="Mark as New" checked={!!form.is_new} onChange={() => set('is_new', !form.is_new)} />
                <Toggle label="Mark as Featured" checked={!!form.is_featured} onChange={() => set('is_featured', !form.is_featured)} />
              </div>
            </div>
          )}

          {/* ── VARIANTS & STOCK ── */}
          {tab === 'variants' && (
            <div className="space-y-5">
              <Toggle label="This product has variants (sizes / colors)" checked={!!form.has_variants} onChange={() => set('has_variants', !form.has_variants)} />

              {!form.has_variants && (
                <Field label="Stock Quantity">
                  <Input type="number" min="0" value={form.stock_quantity || 0} onChange={e => set('stock_quantity', e.target.value)} />
                </Field>
              )}

              {form.has_variants && (
                <div className="space-y-5">
                  <ChipInput label="Sizes" chips={sizes} setChips={setSizes} suggestions={SIZES} />
                  <ChipInput label="Colors" chips={colors} setChips={setColors} suggestions={COLORS_DEFAULT} />

                  {(sizes.length > 0 || colors.length > 0) && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Stock per variant (qty_on_hand)</p>
                      <div className="overflow-x-auto">
                        <table className="text-sm">
                          <thead>
                            <tr>
                              <th className="text-left pr-4 pb-2 text-xs text-muted-foreground font-medium">Size / Color</th>
                              {colors.length > 0 ? colors.map(c => (
                                <th key={c} className="pb-2 px-3 text-xs text-muted-foreground font-medium text-center">{c}</th>
                              )) : <th className="pb-2 px-3 text-xs text-muted-foreground font-medium text-center">Qty</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {(sizes.length > 0 ? sizes : ['']).map(size => (
                              <tr key={size}>
                                <td className="pr-4 py-1.5 text-sm font-medium text-foreground">{size || 'Default'}</td>
                                {(colors.length > 0 ? colors : ['']).map(color => (
                                  <td key={color} className="px-2 py-1.5">
                                    <input
                                      type="number" min="0"
                                      value={variantGrid[variantKey(size, color)]?.qty ?? 0}
                                      onChange={e => setVariantQty(size, color, e.target.value)}
                                      className="w-16 px-2 py-1 rounded-lg border border-input bg-background text-sm text-center outline-none focus:ring-2 focus:ring-ring"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── IMAGES ── */}
          {tab === 'images' && (
            <div className="space-y-4">
              {/* Upload zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleImageUpload([...e.dataTransfer.files]); }}
                className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Uploading…</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Drop images here or <span className="text-primary font-medium">click to upload</span></p>
                    <p className="text-xs text-muted-foreground mt-1">Multiple files supported</p>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
                onChange={e => handleImageUpload([...e.target.files])} />

              {/* Image grid */}
              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {images.map((img, idx) => (
                    <div key={idx} className={`relative rounded-xl overflow-hidden border-2 transition-colors ${img.is_primary ? 'border-primary' : 'border-border'}`}>
                      {/* Thumb reflects the 3:4 card framing so admins preview crop/focal inline */}
                      <div className="relative w-full aspect-[3/4] bg-secondary overflow-hidden">
                        <img src={img.url} alt="" style={frameImageStyle(img.focal, img.crop)} draggable={false} />
                      </div>
                      <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors flex items-center justify-center gap-1.5 opacity-0 hover:opacity-100">
                        <button type="button" onClick={() => setPrimary(idx)} title="Set as primary"
                          className="p-1.5 bg-white rounded-full shadow hover:bg-amber-50">
                          <Star className={`w-3.5 h-3.5 ${img.is_primary ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                        </button>
                        <button type="button" onClick={() => setEditingImageIdx(editingImageIdx === idx ? null : idx)} title="Adjust crop & focal point"
                          className="p-1.5 bg-white rounded-full shadow hover:bg-primary/10">
                          <CropIcon className={`w-3.5 h-3.5 ${editingImageIdx === idx ? 'text-primary' : 'text-muted-foreground'}`} />
                        </button>
                        <button type="button" onClick={() => removeImage(idx)} title="Remove image"
                          className="p-1.5 bg-white rounded-full shadow hover:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                      {img.is_primary && (
                        <span className="absolute top-1.5 left-1.5 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">Primary</span>
                      )}
                      {(img.crop || (img.focal && (img.focal.x !== 0.5 || img.focal.y !== 0.5))) && (
                        <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">Framed</span>
                      )}
                      {/* Link this photo to a color so the storefront card can
                          show it when a shopper selects that color swatch. */}
                      {colors.length > 0 && (
                        <div className="p-1.5 bg-card border-t border-border">
                          <select value={img.color || ''} onChange={e => setImageColor(idx, e.target.value)}
                            className="w-full text-[11px] px-1.5 py-1 rounded-lg border border-input bg-background text-foreground outline-none focus:ring-1 focus:ring-ring">
                            <option value="">No color link</option>
                            {colors.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {images.length > 0 && colors.length === 0 && (
                <p className="text-xs text-muted-foreground">Tip: add colors in the “Variants & Stock” tab to link each photo to a color (so the storefront card can switch the image when a shopper picks a color).</p>
              )}

              {/* Per-image framing editor */}
              {editingImageIdx != null && images[editingImageIdx] && (
                <div className="border border-border rounded-2xl p-4 bg-muted/30">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-foreground">Frame image {editingImageIdx + 1} for the 3:4 card</p>
                    <button type="button" onClick={() => setEditingImageIdx(null)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
                  </div>
                  <ImageFramingEditor
                    url={images[editingImageIdx].url}
                    focal={images[editingImageIdx].focal}
                    crop={images[editingImageIdx].crop}
                    onChange={(framing) => setImageFraming(editingImageIdx, framing)}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── PREVIEW ── */}
          {tab === 'preview' && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-xs text-muted-foreground">Storefront card preview</p>
              <div className="w-52 bg-card border border-border rounded-2xl overflow-hidden shadow-md">
                <div className="relative w-full aspect-[3/4] bg-secondary flex items-center justify-center overflow-hidden">
                  {primaryImg
                    ? <img src={primaryImg} alt={form.name} style={frameImageStyle(primaryImageObj?.focal, primaryImageObj?.crop)} draggable={false} />
                    : <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
                  }
                </div>
                <div className="p-3">
                  <div className="flex gap-1 mb-1 flex-wrap">
                    {form.is_new && <span className="text-xs bg-accent/50 text-accent-foreground px-2 py-0.5 rounded-full">New</span>}
                    {form.is_featured && <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">★ Featured</span>}
                  </div>
                  <p className="font-heading font-semibold text-foreground text-sm leading-tight">{form.name || 'Product Name'}</p>
                  {form.name_ar && <p className="text-xs text-muted-foreground mt-0.5" dir="rtl">{form.name_ar}</p>}
                  <div className="flex items-baseline gap-1.5 mt-2">
                    <span className="font-bold text-foreground">${Number(form.price_usd || 0).toFixed(2)}</span>
                    {form.compare_at_price_usd > form.price_usd && (
                      <span className="text-xs text-muted-foreground line-through">${Number(form.compare_at_price_usd).toFixed(2)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {error && <p className="px-6 py-2 text-xs text-destructive bg-destructive/5">{error}</p>}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="px-5 py-2 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
          <button onClick={handleSave} disabled={saving || skuCollision || (isClone && !(form.sku || '').trim())}
            className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
            {saving ? 'Saving…' : isClone ? 'Create Duplicate' : isNew ? 'Create Product' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}