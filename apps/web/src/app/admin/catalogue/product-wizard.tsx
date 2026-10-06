'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { adminFetch, adminUpload } from '@/lib/admin-api';
import { MediaPicker } from '@/components/media-picker';

export interface CatNode {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  children?: CatNode[];
}
interface Brand {
  id: string;
  name: string;
}

const toPaise = (rupees: string) => Math.round(parseFloat(rupees || '0') * 100);

/** Build a SKU from a base string when the admin leaves it blank. */
const autoSku = (base: string) =>
  `${(base || 'ITEM')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 18)
    .toUpperCase() || 'ITEM'}-${Math.floor(1000 + Math.random() * 9000)}`;

const OCCASIONS = ['', 'Casual', 'Festive', 'Wedding', 'Party', 'Daily', 'Office'];
const PATTERNS = ['', 'Solid', 'Printed', 'Woven', 'Embroidered', 'Checked', 'Striped'];
const TAX_CLASSES = ['Taxable Goods', 'Exempt', 'Zero-rated'];

/** Standardized 3-step Add Product wizard: category → details → publish. */
export function ProductWizard({
  categories,
  brands,
  onCreated,
  onCancel,
  onCategoriesChanged,
  onBrandsChanged,
}: {
  categories: CatNode[];
  brands: Brand[];
  onCreated: () => void;
  onCancel: () => void;
  onCategoriesChanged?: () => void;
  onBrandsChanged?: () => void;
}) {
  const [step, setStep] = useState(1);

  // Step 1 — category path (primary → sub → final)
  const [primary, setPrimary] = useState<CatNode | null>(null);
  const [sub, setSub] = useState<CatNode | null>(null);
  const [final, setFinal] = useState<CatNode | null>(null);
  const selectedCat = final ?? sub ?? primary;

  // Inline category edit (works for all three columns, incl. Final Detail)
  const [catEditId, setCatEditId] = useState<string | null>(null);
  const [catEditName, setCatEditName] = useState('');
  const [catEditImage, setCatEditImage] = useState('');
  const [catEditParent, setCatEditParent] = useState<string | null>(null);
  const [catEditBusy, setCatEditBusy] = useState(false);
  const [catEditUploading, setCatEditUploading] = useState(false);

  // Which media picker is open: category-icon edit, product images, or none.
  const [pickerMode, setPickerMode] = useState<'cat' | 'product' | null>(null);

  // Keep the selected primary/sub/final in sync with fresh category data
  // after an inline edit (the parent reloads and passes new `categories`).
  useEffect(() => {
    const find = (nodes: CatNode[], id: string): CatNode | null => {
      for (const n of nodes) {
        if (n.id === id) return n;
        const hit = n.children ? find(n.children, id) : null;
        if (hit) return hit;
      }
      return null;
    };
    setPrimary((p) => (p ? find(categories, p.id) : p));
    setSub((s) => (s ? find(categories, s.id) : s));
    setFinal((f) => (f ? find(categories, f.id) : f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  function startCatEdit(e: React.MouseEvent, c: CatNode, parentId: string | null) {
    e.stopPropagation();
    setCatEditId(c.id);
    setCatEditName(c.name);
    setCatEditImage(c.imageUrl ?? '');
    setCatEditParent(parentId);
    setMsg(null);
  }

  async function uploadCatEditImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCatEditUploading(true);
    try {
      const { url } = await adminUpload(file, 'categories');
      setCatEditImage(url);
    } finally {
      setCatEditUploading(false);
      e.target.value = '';
    }
  }

  async function saveCatEdit() {
    if (!catEditId || !catEditName.trim()) {
      setMsg('Category name is required.');
      return;
    }
    setCatEditBusy(true);
    try {
      await adminFetch('/admin/categories', {
        method: 'POST',
        body: {
          id: catEditId,
          name: catEditName.trim(),
          parentId: catEditParent,
          imageUrl: catEditImage || undefined,
        },
      });
      setCatEditId(null);
      onCategoriesChanged?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not update category.');
    } finally {
      setCatEditBusy(false);
    }
  }

  // Step 2 — details
  const [hasVariants, setHasVariants] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [dragImg, setDragImg] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [brandId, setBrandId] = useState('');
  const [addingBrand, setAddingBrand] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [brandBusy, setBrandBusy] = useState(false);
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('1');
  const [mrp, setMrp] = useState('');
  const [price, setPrice] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [gst, setGst] = useState('5');
  const [taxClass, setTaxClass] = useState('Taxable Goods');
  const [isReturnable, setIsReturnable] = useState(true);

  // Attributes
  const [weight, setWeight] = useState('');
  const [fabric, setFabric] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [origin, setOrigin] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [occasion, setOccasion] = useState('');
  const [care, setCare] = useState('');
  const [pattern, setPattern] = useState('');

  // Variant rows (when hasVariants)
  const [variants, setVariants] = useState<
    { size: string; color: string; sku: string; mrp: string; price: string; stock: string }[]
  >([{ size: '', color: '', sku: '', mrp: '', price: '', stock: '' }]);

  // Optional bulk pricing tiers: % off per minimum quantity, applied to every
  // variant of the product on create. Empty = none (feature is optional).
  const [bulkTiers, setBulkTiers] = useState<{ minQty: string; discountPct: string }[]>([]);

  // SEO
  const [metaTitle, setMetaTitle] = useState('');
  const [metaKeywords, setMetaKeywords] = useState('');
  const [metaDescription, setMetaDescription] = useState('');

  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const primaryList = categories;
  const subList = primary?.children ?? [];
  const finalList = sub?.children ?? [];

  async function uploadFiles(fileList: FileList | File[] | null) {
    const files = Array.from(fileList ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const f of files) {
        const { url } = await adminUpload(f, 'products');
        setImages((cur) => [...cur, url]);
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    await uploadFiles(e.target.files);
    e.target.value = '';
  }

  const productAttributes = useMemo(() => {
    const a: Record<string, string> = {};
    if (fabric) a['Fabric'] = fabric;
    if (origin) a['State of Origin'] = origin;
    if (occasion) a['Occasion'] = occasion;
    if (care) a['Care Instructions'] = care;
    if (pattern) a['Print or Pattern'] = pattern;
    if (dimensions) a['Dimensions'] = dimensions;
    if (!hasVariants && size) a['Size'] = size;
    if (!hasVariants && color) a['Color'] = color;
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabric, origin, occasion, care, pattern, dimensions, size, color, hasVariants]);

  async function saveNewBrand() {
    const name = newBrand.trim();
    if (!name) return;
    setBrandBusy(true);
    try {
      const created = await adminFetch<{ id: string }>('/admin/brands', {
        method: 'POST',
        body: { name },
      });
      setBrandId(created.id);
      setAddingBrand(false);
      setNewBrand('');
      onBrandsChanged?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not add brand.');
    } finally {
      setBrandBusy(false);
    }
  }

  async function submit() {
    setMsg(null);
    if (!selectedCat) return setMsg('Please select a category.');
    if (!title) return setMsg('Product name is required.');

    // SKU is optional — auto-generate one when left blank so the product still
    // gets a variant and can be published (and thus appear on the storefront).
    const rows = hasVariants
      ? variants
          .filter((v) => v.mrp)
          .map((v) => ({
            ...v,
            price: v.price || v.mrp,
            sku: v.sku.trim() || autoSku(`${title}-${v.size}${v.color}`),
          }))
      : mrp
        ? [{ size, color, sku: sku.trim() || autoSku(title), mrp, price: price || mrp, stock: qty }]
        : [];
    if (publish && rows.length === 0) {
      return setMsg('To publish, enter at least the MRP (SKU & selling price auto-fill if left blank).');
    }
    for (const r of rows) {
      if (toPaise(r.price) > toPaise(r.mrp)) return setMsg(`Selling price cannot exceed MRP (${r.sku}).`);
    }

    setBusy(true);
    try {
      const product = await adminFetch<{ id: string }>('/admin/products', {
        method: 'POST',
        body: {
          title,
          categoryId: selectedCat.id,
          brandId: brandId || undefined,
          description: description || undefined,
          hsnCode: hsnCode || undefined,
          taxRatePct: Number(gst) || 0,
          isReturnable,
          attributes: productAttributes,
          seoTitle: metaTitle || undefined,
          seoKeywords: metaKeywords || undefined,
          seoDescription: metaDescription || undefined,
        },
      });

      if (images.length > 0) {
        await adminFetch(`/admin/products/${product.id}/images`, {
          method: 'PUT',
          body: { images: images.map((url) => ({ url })) },
        });
      }

      for (const r of rows) {
        const attrs: Record<string, string> = {};
        if (r.size) attrs['Size'] = r.size;
        if (r.color) attrs['Color'] = r.color;
        const variant = await adminFetch<{ id: string }>('/admin/variants', {
          method: 'POST',
          body: {
            productId: product.id,
            sku: r.sku,
            mrp: toPaise(r.mrp),
            sellingPrice: toPaise(r.price),
            weightGrams: !hasVariants && weight ? parseInt(weight, 10) : undefined,
            attributes: Object.keys(attrs).length ? attrs : undefined,
          },
        });
        const stock = parseInt(r.stock || '0', 10);
        if (stock > 0) {
          await adminFetch(`/admin/inventory/${variant.id}/adjust`, {
            method: 'POST',
            body: { delta: stock, ref: 'initial-stock' },
          });
        }
      }

      // Optional bulk pricing tiers — applied to every variant just created.
      const tiers = bulkTiers
        .filter((t) => t.minQty && t.discountPct)
        .map((t) => ({ minQty: parseInt(t.minQty, 10), discountPct: parseFloat(t.discountPct) }));
      if (tiers.length > 0 && rows.length > 0) {
        await adminFetch(`/admin/products/${product.id}/price-slabs`, {
          method: 'POST',
          body: { tiers },
        });
      }

      if (publish && rows.length > 0) {
        await adminFetch(`/admin/products/${product.id}/status`, {
          method: 'PATCH',
          body: { status: 'published' },
        });
      }
      onCreated();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not create product.');
    } finally {
      setBusy(false);
    }
  }

  /** A category chip that can be selected, or edited inline (name + image). */
  const renderCatChip = (
    c: CatNode,
    selected: boolean,
    onSelect: () => void,
    parentId: string | null,
    trailing: React.ReactNode,
  ) => (
    <div className="wiz__cat-wrap" key={c.id}>
      {catEditId === c.id ? (
        <div className="wiz__cat-edit">
          <input
            className="auth-input"
            value={catEditName}
            onChange={(e) => setCatEditName(e.target.value)}
            data-testid="wiz-cat-edit-name"
            autoFocus
          />
          <div className="wiz__cat-edit-img">
            <input type="file" accept="image/*" onChange={uploadCatEditImg} disabled={catEditUploading} />
            <button
              type="button"
              className="mediapick__open"
              onClick={() => setPickerMode('cat')}
              data-testid="wiz-cat-edit-choose-library"
            >
              Choose from library
            </button>
            {catEditUploading && <span className="prod-form__hint"> Uploading…</span>}
            {catEditImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={catEditImage} alt="" />
            )}
          </div>
          <div className="wiz__cat-edit-actions">
            <button
              type="button"
              className="wiz__cat-save"
              onClick={saveCatEdit}
              disabled={catEditBusy}
              data-testid="wiz-cat-edit-save"
            >
              {catEditBusy ? 'Saving…' : 'Update'}
            </button>
            <button
              type="button"
              className="wiz__cat-cancel"
              onClick={() => setCatEditId(null)}
              disabled={catEditBusy}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button className={`wiz__cat${selected ? ' is-sel' : ''}`} onClick={onSelect}>
            {c.name} {trailing}
          </button>
          <button
            type="button"
            className="wiz__cat-editbtn"
            title={`Edit ${c.name}`}
            aria-label={`Edit ${c.name}`}
            onClick={(e) => startCatEdit(e, c, parentId)}
            data-testid="wiz-cat-edit"
          >
            ✎
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="wiz" data-testid="product-wizard">
      <div className="wiz__steps">
        {['Select Category', 'Product Details', 'Publish Product'].map((label, i) => {
          const n = i + 1;
          const state = step > n ? 'is-done' : step === n ? 'is-on' : '';
          return (
            <Fragment key={label}>
              {i > 0 && <span className="wiz__step-bar" aria-hidden />}
              <div className={`wiz__step ${state}`}>
                <span className="wiz__step-no">{step > n ? '✓' : n}</span>
                <span className="wiz__step-label">{label}</span>
              </div>
            </Fragment>
          );
        })}
      </div>

      {msg && <p className="prod-form__msg" role="status">{msg}</p>}

      {/* STEP 1 — category */}
      {step === 1 && (
        <div className="wiz__body">
          <div className="wiz__head">
            <h2>Select product category</h2>
            <p>Pick the category path this product belongs to — primary, then sub-category, then an optional final detail.</p>
          </div>
          {selectedCat && (
            <div className="wiz__crumb">
              Selected: {primary?.name}
              {sub ? ` › ${sub.name}` : ''}
              {final ? ` › ${final.name}` : ''}
            </div>
          )}
          <div className="wiz__cols">
            <div className="wiz__col">
              <div className="wiz__col-head">PRIMARY CATEGORY</div>
              {primaryList.map((c) =>
                renderCatChip(
                  c,
                  primary?.id === c.id,
                  () => {
                    setPrimary(c);
                    setSub(null);
                    setFinal(null);
                  },
                  null,
                  c.children?.length ? <span>›</span> : null,
                ),
              )}
            </div>
            <div className="wiz__col">
              <div className="wiz__col-head">SUB-CATEGORY</div>
              {subList.length === 0 ? (
                <p className="wiz__col-empty">Select a primary category first</p>
              ) : (
                subList.map((c) =>
                  renderCatChip(
                    c,
                    sub?.id === c.id,
                    () => {
                      setSub(c);
                      setFinal(null);
                    },
                    primary?.id ?? null,
                    c.children?.length ? <span>›</span> : null,
                  ),
                )
              )}
            </div>
            <div className="wiz__col">
              <div className="wiz__col-head">FINAL DETAIL</div>
              {finalList.length === 0 ? (
                <p className="wiz__col-empty">Select a sub-category first</p>
              ) : (
                finalList.map((c) =>
                  renderCatChip(
                    c,
                    final?.id === c.id,
                    () => setFinal(c),
                    sub?.id ?? null,
                    final?.id === c.id ? '✓' : '',
                  ),
                )
              )}
            </div>
          </div>
          <div className="wiz__nav">
            <button className="wiz__ghost" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="wiz__next"
              disabled={!selectedCat}
              onClick={() => setStep(2)}
              data-testid="wiz-to-details"
            >
              Continue to Product Details ›
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — details */}
      {step === 2 && (
        <div className="wiz__body">
          <div className="wiz__head">
            <h2>Product details</h2>
            <p>Add images, information, pricing and attributes. Fields marked * are required to publish.</p>
          </div>
          <div className="wiz__card">
            <h3>📦 Product Variants</h3>
            <div className="wiz__radios">
              <label className={`wiz__radio${hasVariants ? ' is-on' : ''}`}>
                <input type="radio" checked={hasVariants} onChange={() => setHasVariants(true)} />
                <span>I want to add variants<em>e.g. different sizes, colours or materials</em></span>
              </label>
              <label className={`wiz__radio${!hasVariants ? ' is-on' : ''}`}>
                <input type="radio" checked={!hasVariants} onChange={() => setHasVariants(false)} />
                <span>Single product<em>One price and stock</em></span>
              </label>
            </div>
          </div>

          <div className="wiz__card">
            <h3>🖼️ Product Images</h3>
            <label
              className={`wiz__drop${dragOver ? ' wiz__drop--over' : ''}`}
              aria-disabled={uploading}
              onDragOver={(e) => {
                e.preventDefault();
                if (!uploading) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!uploading) void uploadFiles(e.dataTransfer.files);
              }}
            >
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFiles}
                disabled={uploading}
                data-testid="wiz-images"
                className="wiz__drop-input"
              />
              <span className="wiz__drop-ic">⬆</span>
              <span className="wiz__drop-main">
                {uploading ? 'Uploading…' : dragOver ? 'Drop images to upload' : 'Click or drag images here to upload'}
              </span>
              <span className="wiz__drop-sub">PNG or JPG · drag &amp; drop or click · multiple allowed</span>
            </label>
            <button
              type="button"
              className="mediapick__open"
              onClick={() => setPickerMode('product')}
              data-testid="wiz-images-choose-library"
            >
              Choose from library
            </button>
            {images.length > 0 && (
              <>
                <p className="prod-imghint">
                  You can upload multiple images. The <strong>Main</strong> image (first one) is shown on cards and the
                  product page. <strong>Drag thumbnails to reorder</strong>, or tap ★ to jump an image to the front.
                </p>
                <div className="prod-thumbs">
                  {images.map((url, i) => (
                    <div
                      className={`prod-thumb${i === 0 ? ' prod-thumb--main' : ''}${dragImg === i ? ' prod-thumb--dragging' : ''}`}
                      key={url}
                      draggable
                      onDragStart={() => setDragImg(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        setImages((cur) => {
                          if (dragImg === null || dragImg === i) return cur;
                          const next = [...cur];
                          const [picked] = next.splice(dragImg, 1);
                          next.splice(i, 0, picked);
                          return next;
                        });
                        setDragImg(null);
                      }}
                      onDragEnd={() => setDragImg(null)}
                      title="Drag to reorder — the first image is the main cover"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" />
                      {i === 0 ? (
                        <span className="prod-thumb__badge">Main</span>
                      ) : (
                        <button
                          type="button"
                          className="prod-thumb__star"
                          title="Set as main image"
                          aria-label="Set as main image"
                          onClick={() =>
                            setImages((cur) => {
                              const next = [...cur];
                              const [picked] = next.splice(i, 1);
                              next.unshift(picked);
                              return next;
                            })
                          }
                        >
                          ★
                        </button>
                      )}
                      <button
                        type="button"
                        className="prod-thumb__del"
                        aria-label="Remove image"
                        onClick={() => setImages(images.filter((_, j) => j !== i))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="wiz__card">
            <h3>📝 Product Information</h3>
            <div className="prod-grid">
              <div className="prod-grid__full">
                <label className="auth-label">Product Name *</label>
                <input className="auth-input" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="wiz-title" />
              </div>
              <div className="prod-grid__full">
                <label className="auth-label">Product Description *</label>
                <textarea className="auth-input prod-textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detailed description, features, materials, care…" />
              </div>
              <div>
                <label className="auth-label">Brand</label>
                {addingBrand ? (
                  <div className="wiz__brand-add">
                    <input
                      className="auth-input"
                      value={newBrand}
                      onChange={(e) => setNewBrand(e.target.value)}
                      placeholder="New brand name"
                      data-testid="wiz-new-brand"
                      autoFocus
                    />
                    <div className="wiz__brand-add-actions">
                      <button
                        type="button"
                        className="wiz__cat-save"
                        onClick={saveNewBrand}
                        disabled={brandBusy}
                        data-testid="wiz-new-brand-save"
                      >
                        {brandBusy ? 'Adding…' : 'Add'}
                      </button>
                      <button
                        type="button"
                        className="wiz__cat-cancel"
                        onClick={() => {
                          setAddingBrand(false);
                          setNewBrand('');
                        }}
                        disabled={brandBusy}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="wiz__brand-row">
                    <select className="auth-input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                      <option value="">— none —</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="wiz__brand-new"
                      onClick={() => setAddingBrand(true)}
                      data-testid="wiz-add-brand"
                    >
                      + New
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {!hasVariants && (
            <div className="wiz__card">
              <h3>🏷️ Pricing &amp; Stock</h3>
              <div className="prod-grid">
                <div>
                  <label className="auth-label">SKU</label>
                  <input className="auth-input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Auto if left blank" />
                </div>
                <div>
                  <label className="auth-label">Quantity *</label>
                  <input className="auth-input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>
                <div>
                  <label className="auth-label">MRP (₹) *</label>
                  <input className="auth-input" type="number" value={mrp} onChange={(e) => setMrp(e.target.value)} />
                </div>
                <div>
                  <label className="auth-label">Selling Price (₹)</label>
                  <input className="auth-input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {hasVariants && (
            <div className="wiz__card">
              <h3>🎨 Variants</h3>
              <div className="wiz__vhead">
                <span>Size</span>
                <span>Color</span>
                <span>SKU</span>
                <span>MRP</span>
                <span>Price</span>
                <span>Stock</span>
                <span />
              </div>
              {variants.map((v, i) => (
                <div className="wiz__vrow" key={i}>
                  <input className="auth-input" placeholder="Size" value={v.size} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, size: e.target.value } : x)))} />
                  <input className="auth-input" placeholder="Color" value={v.color} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
                  <input className="auth-input" placeholder="SKU" value={v.sku} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} />
                  <input className="auth-input" type="number" placeholder="MRP" value={v.mrp} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, mrp: e.target.value } : x)))} />
                  <input className="auth-input" type="number" placeholder="Price" value={v.price} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                  <input className="auth-input" type="number" placeholder="Stock" value={v.stock} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, stock: e.target.value } : x)))} />
                  <button type="button" className="wiz__vdel" onClick={() => setVariants(variants.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button type="button" className="wiz__addvar" onClick={() => setVariants([...variants, { size: '', color: '', sku: '', mrp: '', price: '', stock: '' }])}>
                + Add variant
              </button>
            </div>
          )}

          <div className="wiz__card">
            <h3>
              💹 Bulk Pricing Tiers{' '}
              <span style={{ fontWeight: 400, fontSize: '0.85rem', opacity: 0.7 }}>(optional)</span>
            </h3>
            <p className="prod-form__hint" style={{ marginTop: 0 }}>
              Give a discount when customers buy more. Each tier is a <strong>minimum quantity</strong>{' '}
              and a <strong>% off</strong> the selling price, applied to every variant. Leave empty to
              skip — it is not required.
            </p>
            {bulkTiers.length > 0 && (
              <table className="slab-editor__table" data-testid="wiz-bulk-tiers">
                <thead>
                  <tr>
                    <th>Min qty</th>
                    <th>Discount %</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {bulkTiers.map((t, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          className="auth-input"
                          type="number"
                          min={2}
                          placeholder="e.g. 3"
                          value={t.minQty}
                          onChange={(e) =>
                            setBulkTiers(bulkTiers.map((x, j) => (j === i ? { ...x, minQty: e.target.value } : x)))
                          }
                          data-testid={`wiz-tier-minqty-${i}`}
                        />
                      </td>
                      <td>
                        <input
                          className="auth-input"
                          type="number"
                          min={0}
                          max={95}
                          step="0.5"
                          placeholder="e.g. 10"
                          value={t.discountPct}
                          onChange={(e) =>
                            setBulkTiers(bulkTiers.map((x, j) => (j === i ? { ...x, discountPct: e.target.value } : x)))
                          }
                          data-testid={`wiz-tier-pct-${i}`}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="slab-editor__remove"
                          onClick={() => setBulkTiers(bulkTiers.filter((_, j) => j !== i))}
                          aria-label="Remove tier"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button
              type="button"
              className="wiz__addvar"
              onClick={() => setBulkTiers([...bulkTiers, { minQty: '', discountPct: '' }])}
              data-testid="wiz-add-tier"
            >
              + Add bulk tier
            </button>
          </div>

          <div className="wiz__card">
            <h3>🧾 Tax</h3>
            <div className="prod-grid">
              <div>
                <label className="auth-label">HSN Code *</label>
                <input className="auth-input" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} placeholder="e.g. 62034200" />
              </div>
              <div>
                <label className="auth-label">GST Rate (%) *</label>
                <input className="auth-input" type="number" value={gst} onChange={(e) => setGst(e.target.value)} placeholder="5, 12, 18" />
              </div>
              <div>
                <label className="auth-label">Tax Class</label>
                <select className="auth-input" value={taxClass} onChange={(e) => setTaxClass(e.target.value)}>
                  {TAX_CLASSES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="wiz__card">
            <h3>↩️ Return Policy</h3>
            <label className="wiz__returnable">
              <input
                type="checkbox"
                checked={isReturnable}
                onChange={(e) => setIsReturnable(e.target.checked)}
                data-testid="wiz-returnable"
              />
              <span>
                Allow returns for this product
                <em>Uncheck for non-returnable items like food, groceries and perishables.</em>
              </span>
            </label>
          </div>

          <div className="wiz__card">
            <h3>📐 Product Attributes</h3>
            <div className="prod-grid">
              <div>
                <label className="auth-label">Weight (in grams){!hasVariants ? ' *' : ''}</label>
                <input className="auth-input" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 500" />
              </div>
              <div>
                <label className="auth-label">Fabric</label>
                <input className="auth-input" value={fabric} onChange={(e) => setFabric(e.target.value)} placeholder="e.g. Cotton" />
              </div>
              {!hasVariants && (
                <div>
                  <label className="auth-label">Size</label>
                  <input className="auth-input" value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. M / 1 kg" />
                </div>
              )}
              {!hasVariants && (
                <div>
                  <label className="auth-label">Color</label>
                  <input className="auth-input" value={color} onChange={(e) => setColor(e.target.value)} />
                </div>
              )}
              <div>
                <label className="auth-label">State of Origin</label>
                <input className="auth-input" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Karnataka" />
              </div>
              <div>
                <label className="auth-label">Dimensions (L×B×H cm)</label>
                <input className="auth-input" value={dimensions} onChange={(e) => setDimensions(e.target.value)} />
              </div>
              <div>
                <label className="auth-label">Occasion</label>
                <select className="auth-input" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
                  {OCCASIONS.map((o) => <option key={o} value={o}>{o || 'Select Occasion'}</option>)}
                </select>
              </div>
              <div>
                <label className="auth-label">Care Instructions</label>
                <input className="auth-input" value={care} onChange={(e) => setCare(e.target.value)} />
              </div>
              <div>
                <label className="auth-label">Print or Pattern Type</label>
                <select className="auth-input" value={pattern} onChange={(e) => setPattern(e.target.value)}>
                  {PATTERNS.map((p) => <option key={p} value={p}>{p || 'Select Pattern'}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="wiz__card">
            <h3>🔍 Search Engine Optimization</h3>
            <div className="prod-grid">
              <div className="prod-grid__full">
                <label className="auth-label">Meta Title</label>
                <input className="auth-input" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} maxLength={70} placeholder="SEO page title (max 70 chars)" />
              </div>
              <div className="prod-grid__full">
                <label className="auth-label">Meta Keywords</label>
                <input className="auth-input" value={metaKeywords} onChange={(e) => setMetaKeywords(e.target.value)} placeholder="keyword1, keyword2, keyword3" />
              </div>
              <div className="prod-grid__full">
                <label className="auth-label">Meta Description</label>
                <textarea className="auth-input prod-textarea" rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} maxLength={160} placeholder="SEO description (max 160 chars)" />
              </div>
            </div>
          </div>

          <div className="wiz__nav">
            <button className="wiz__ghost" onClick={() => setStep(1)}>‹ Back</button>
            <button className="wiz__next" onClick={() => setStep(3)} disabled={!title} data-testid="wiz-to-publish">
              Continue ›
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — publish */}
      {step === 3 && (
        <div className="wiz__body">
          <div className="wiz__head">
            <h2>Review &amp; publish</h2>
            <p>Check the summary below, then publish immediately or save as a draft.</p>
          </div>
          <div className="wiz__card">
            <h3>✅ Review &amp; Publish</h3>
            <ul className="wiz__review">
              <li><span>Category</span><strong>{selectedCat?.name}</strong></li>
              <li><span>Product</span><strong>{title || '—'}</strong></li>
              <li><span>Images</span><strong>{images.length}</strong></li>
              <li><span>Type</span><strong>{hasVariants ? 'Variants' : 'Single'}</strong></li>
              <li><span>MRP</span><strong>{hasVariants ? `${variants.length} variants` : mrp ? `₹${mrp}` : '—'}</strong></li>
            </ul>
            <label className="prod-publish">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              Publish immediately (needs a variant with SKU + price)
            </label>
          </div>
          <div className="wiz__nav">
            <button className="wiz__ghost" onClick={() => setStep(2)}>‹ Back</button>
            <button className="wiz__next" onClick={submit} disabled={busy} data-testid="wiz-submit">
              {busy ? 'Saving…' : publish ? 'Publish Product' : 'Save as Draft'}
            </button>
          </div>
        </div>
      )}

      {pickerMode && (
        <MediaPicker
          folder={pickerMode === 'cat' ? 'categories' : 'products'}
          title={pickerMode === 'cat' ? 'Choose category icon' : 'Choose product image'}
          onSelect={(url) =>
            pickerMode === 'cat' ? setCatEditImage(url) : setImages((cur) => [...cur, url])
          }
          onClose={() => setPickerMode(null)}
        />
      )}
    </div>
  );
}
