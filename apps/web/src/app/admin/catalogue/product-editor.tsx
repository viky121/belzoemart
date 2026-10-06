'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, adminUpload } from '@/lib/admin-api';
import { MediaPicker } from '@/components/media-picker';
import {
  initialEdit,
  stockDelta,
  validateEdits,
  variantUpsertBody,
  type AdminVariantRow,
  type VariantEdit,
} from '@/lib/variant-edit';

type ProductStatus = 'draft' | 'published' | 'archived';

interface Opt {
  id: string;
  name: string;
}
interface Detail {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  brandId: string | null;
  hsnCode: string;
  taxRatePct: number;
  status: ProductStatus;
  isReturnable: boolean;
  images: { url: string; alt: string }[];
  shgName: string | null;
  story: string | null;
  seoTitle: string | null;
  seoKeywords: string | null;
  seoDescription: string | null;
  attributes: Record<string, string> | null;
}

const ATTR_KEYS = [
  'Fabric',
  'Size',
  'Color',
  'State of Origin',
  'Dimensions',
  'Occasion',
  'Care Instructions',
  'Print or Pattern',
];

/** Edit an existing product's details + gallery (reflects on the storefront). */
export function ProductEditor({
  productId,
  categories,
  brands,
  onSaved,
}: {
  productId: string;
  categories: Opt[];
  brands: Opt[];
  onSaved: () => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [dragImg, setDragImg] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [variants, setVariants] = useState<AdminVariantRow[]>([]);
  const [edits, setEdits] = useState<Record<string, VariantEdit>>({});
  const [status, setStatus] = useState<ProductStatus>('draft');

  /** (Re)load the product detail + raw variant rows from the server. */
  const load = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      const [res, vs] = await Promise.all([
        adminFetch<Detail>(`/admin/products/${productId}/detail`),
        adminFetch<AdminVariantRow[]>(`/admin/products/${productId}/variants`),
      ]);
      if (isCancelled()) return;
      setD(res);
      setImages(res.images.map((i) => i.url));
      setStatus(res.status);
      setVariants(vs);
      setEdits(Object.fromEntries(vs.map((v) => [v.id, initialEdit(v)])));
    },
    [productId],
  );

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled).catch(() => {
      if (!cancelled) setMsg('Could not load product.');
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (!d) return <p className="slab-editor__hint">{msg ?? 'Loading…'}</p>;

  const upd = (patch: Partial<Detail>) => setD({ ...d, ...patch });
  const updEdit = (id: string, patch: Partial<VariantEdit>) =>
    setEdits((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const f of files) {
        const { url } = await adminUpload(f, 'products');
        setImages((cur) => [...cur, url]);
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function save() {
    if (!d) return;
    const invalid =
      validateEdits(variants, edits) ??
      (status === 'published' && variants.length === 0 ? 'Add a variant before publishing.' : null);
    if (invalid) {
      setMsg(invalid);
      return;
    }
    setBusy(true);
    setMsg(null);
    let step = 'details';
    let done = 0;
    let touchedVariants = false;
    try {
      await adminFetch(`/admin/products/${d.id}`, {
        method: 'PATCH',
        body: {
          title: d.title,
          categoryId: d.categoryId,
          brandId: d.brandId || null,
          description: d.description,
          hsnCode: d.hsnCode,
          taxRatePct: Number(d.taxRatePct) || 0,
          isReturnable: d.isReturnable,
          shgName: d.shgName ?? '',
          story: d.story ?? '',
          seoTitle: d.seoTitle ?? '',
          seoKeywords: d.seoKeywords ?? '',
          seoDescription: d.seoDescription ?? '',
          attributes: Object.fromEntries(
            Object.entries(d.attributes ?? {}).filter(([, v]) => v),
          ),
        },
      });
      done += 1;
      step = 'images';
      await adminFetch(`/admin/products/${d.id}/images`, {
        method: 'PUT',
        body: { images: images.map((url) => ({ url })) },
      });
      done += 1;
      // SKU / MRP / price: the body carries the variant's existing bulk tiers,
      // attributes, weight and image so the upsert does not wipe them.
      for (const v of variants) {
        const body = variantUpsertBody(v, edits[v.id] ?? initialEdit(v));
        if (!body) continue;
        step = `variant ${v.sku}`;
        touchedVariants = true;
        await adminFetch('/admin/variants', { method: 'POST', body });
        done += 1;
      }
      for (const v of variants) {
        const delta = stockDelta(v, edits[v.id] ?? initialEdit(v));
        if (delta === 0) continue;
        step = `stock for ${v.sku}`;
        touchedVariants = true;
        await adminFetch(`/admin/inventory/${v.id}/adjust`, {
          method: 'POST',
          body: { delta, ref: 'editor-update' },
        });
        done += 1;
      }
      if (status !== d.status) {
        step = 'status';
        touchedVariants = true;
        await adminFetch(`/admin/products/${d.id}/status`, { method: 'PATCH', body: { status } });
        done += 1;
      }
      setMsg('Saved. Changes are live on the storefront.');
      onSaved();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'unknown error';
      setMsg(
        `Could not save ${step}: ${message}` +
          (/slab price/i.test(message)
            ? ' — lower or re-apply the bulk tiers under Variants & pricing first.'
            : '') +
          (done > 0 ? ' Earlier changes were saved.' : ''),
      );
    } finally {
      if (touchedVariants) {
        // Refresh so variants, edits and current stock match the server and the
        // next save computes stock deltas from fresh numbers.
        await load().catch(() => undefined);
      }
      setBusy(false);
    }
  }

  return (
    <div className="prod-form prod-form--edit" data-testid="product-editor">
      {msg && <p className="prod-form__msg" role="status">{msg}</p>}
      <div className="prod-grid">
        <div className="prod-grid__full">
          <label className="auth-label">Title</label>
          <input className="auth-input" value={d.title} onChange={(e) => upd({ title: e.target.value })} />
        </div>
        <div>
          <label className="auth-label">Category</label>
          <select className="auth-input" value={d.categoryId} onChange={(e) => upd({ categoryId: e.target.value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="auth-label">Brand</label>
          <select className="auth-input" value={d.brandId ?? ''} onChange={(e) => upd({ brandId: e.target.value || null })}>
            <option value="">— none —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="auth-label">HSN code</label>
          <input className="auth-input" value={d.hsnCode} onChange={(e) => upd({ hsnCode: e.target.value })} />
        </div>
        <div>
          <label className="auth-label">GST %</label>
          <input className="auth-input" type="number" min={0} max={28} value={d.taxRatePct} onChange={(e) => upd({ taxRatePct: Number(e.target.value) })} />
        </div>
        <div className="prod-grid__full">
          <label className="pe-returnable">
            <input
              type="checkbox"
              checked={d.isReturnable}
              onChange={(e) => upd({ isReturnable: e.target.checked })}
              data-testid="editor-returnable"
            />
            <span>Allow returns (uncheck for non-returnable items like food)</span>
          </label>
        </div>
        <div className="prod-grid__full">
          <label className="auth-label">Description / Key features (one per line)</label>
          <textarea className="auth-input prod-textarea" rows={3} value={d.description} onChange={(e) => upd({ description: e.target.value })} />
        </div>
        <div>
          <label className="auth-label">SHG name</label>
          <input className="auth-input" value={d.shgName ?? ''} onChange={(e) => upd({ shgName: e.target.value })} />
        </div>
        <div className="prod-grid__full">
          <label className="auth-label">SHG / product story</label>
          <textarea className="auth-input prod-textarea" rows={2} value={d.story ?? ''} onChange={(e) => upd({ story: e.target.value })} />
        </div>
      </div>

      <div className="prod-section" data-testid="editor-variants">
        <h3 className="prod-subhead">Variants, price &amp; stock</h3>
        <div className="prod-grid">
          <div>
            <label className="auth-label" htmlFor="editor-status">Status</label>
            <select
              id="editor-status"
              className="auth-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductStatus)}
              data-testid="editor-status"
            >
              <option value="draft">Draft (hidden from storefront)</option>
              <option value="published">Published (live on storefront)</option>
              {d.status === 'archived' && <option value="archived">Archived</option>}
            </select>
          </div>
        </div>
        {variants.length === 0 ? (
          <p className="admin-muted">
            No variants yet — add one under Variants &amp; pricing (a product needs a variant to be published).
          </p>
        ) : (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">SKU</th>
                  <th scope="col">MRP (₹)</th>
                  <th scope="col">Selling (₹)</th>
                  <th scope="col">Stock</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v, i) => {
                  const e = edits[v.id] ?? initialEdit(v);
                  return (
                    <tr key={v.id}>
                      <td>
                        <input
                          className="auth-input"
                          value={e.sku}
                          maxLength={60}
                          aria-label={`SKU for ${v.sku}`}
                          onChange={(ev) => updEdit(v.id, { sku: ev.target.value })}
                          data-testid={`editor-v-sku-${i}`}
                        />
                      </td>
                      <td>
                        <input
                          className="auth-input"
                          type="number"
                          step={0.01}
                          min={0}
                          value={e.mrp}
                          aria-label={`MRP in rupees for ${v.sku}`}
                          onChange={(ev) => updEdit(v.id, { mrp: ev.target.value })}
                          data-testid={`editor-v-mrp-${i}`}
                        />
                      </td>
                      <td>
                        <input
                          className="auth-input"
                          type="number"
                          step={0.01}
                          min={0}
                          value={e.price}
                          aria-label={`Selling price in rupees for ${v.sku}`}
                          onChange={(ev) => updEdit(v.id, { price: ev.target.value })}
                          data-testid={`editor-v-price-${i}`}
                        />
                      </td>
                      <td>
                        <input
                          className="auth-input"
                          type="number"
                          step={1}
                          min={0}
                          value={e.stock}
                          aria-label={`Stock for ${v.sku}`}
                          onChange={(ev) => updEdit(v.id, { stock: ev.target.value })}
                          data-testid={`editor-v-stock-${i}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="prod-imghint">
              Bulk tiers, size/colour, weight and variant image are kept — edit them under
              &apos;Variants &amp; pricing&apos;.
            </p>
          </>
        )}
      </div>

      <div className="prod-section">
        <h3 className="prod-subhead">Product attributes</h3>
        <div className="prod-grid">
          {ATTR_KEYS.map((key) => (
            <div key={key}>
              <label className="auth-label">{key}</label>
              <input
                className="auth-input"
                value={d.attributes?.[key] ?? ''}
                onChange={(e) => upd({ attributes: { ...(d.attributes ?? {}), [key]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="prod-section">
        <h3 className="prod-subhead">Search Engine Optimization</h3>
        <div className="prod-grid">
          <div className="prod-grid__full">
            <label className="auth-label">Meta title</label>
            <input className="auth-input" maxLength={70} value={d.seoTitle ?? ''} onChange={(e) => upd({ seoTitle: e.target.value })} placeholder="SEO page title (max 70 chars)" />
          </div>
          <div className="prod-grid__full">
            <label className="auth-label">Meta keywords</label>
            <input className="auth-input" value={d.seoKeywords ?? ''} onChange={(e) => upd({ seoKeywords: e.target.value })} placeholder="keyword1, keyword2" />
          </div>
          <div className="prod-grid__full">
            <label className="auth-label">Meta description</label>
            <textarea className="auth-input prod-textarea" rows={2} maxLength={160} value={d.seoDescription ?? ''} onChange={(e) => upd({ seoDescription: e.target.value })} placeholder="SEO description (max 160 chars)" />
          </div>
        </div>
      </div>

      <div className="prod-section">
        <label className="auth-label">Images</label>
        <input type="file" accept="image/*" multiple onChange={handleFiles} disabled={uploading} />
        <button
          type="button"
          className="mediapick__open"
          onClick={() => setPickerOpen(true)}
          data-testid="editor-images-choose-library"
        >
          Choose from library
        </button>
        {uploading && <span className="prod-form__hint"> Uploading…</span>}
        {images.length > 0 && (
          <>
            <p className="prod-imghint">
              Upload multiple images. The <strong>Main</strong> image (first) is the cover.{' '}
              <strong>Drag thumbnails to reorder</strong>, or tap ★ to make any image the main one.
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

      <button className="auth-btn prod-save" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save details'}
      </button>

      {pickerOpen && (
        <MediaPicker
          folder="products"
          title="Choose product image"
          onSelect={(url) => setImages((cur) => [...cur, url])}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
