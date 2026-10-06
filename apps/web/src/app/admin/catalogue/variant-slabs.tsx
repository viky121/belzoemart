'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, adminUpload } from '@/lib/admin-api';
import {
  removeVariantConfirmText,
  removeVariantSuccessMessage,
  variantLabel,
  type RemoveVariantMode,
} from '@/lib/variant-edit';

interface SlabRow {
  minQty: number;
  unitPrice: number; // paise
}

interface VariantRow {
  id: string;
  productId: string;
  sku: string;
  mrp: number;
  sellingPrice: number;
  attributesJson: Record<string, string>;
  priceSlabsJson: SlabRow[];
  weightGrams: number;
  imageUrl: string | null;
}

const toRupees = (paise: number) => (paise / 100).toFixed(2);
const toPaise = (rupees: string) => Math.round(parseFloat(rupees || '0') * 100);

/** Admin editor for a product's variants' bulk price slabs. */
export function VariantSlabsEditor({
  productId,
  onChanged,
}: {
  productId: string;
  /** Called after a variant is removed so the catalogue table can refresh counts/stock. */
  onChanged?: () => void;
}) {
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [slabs, setSlabs] = useState<Record<string, { minQty: string; price: string }[]>>({});
  const [productTiers, setProductTiers] = useState<{ minQty: string; discountPct: string }[]>([
    { minQty: '2', discountPct: '' },
  ]);
  const [nv, setNv] = useState({
    sku: '',
    mrp: '',
    price: '',
    stock: '',
    size: '',
    color: '',
    weight: '',
    imageUrl: '',
  });
  const [meta, setMeta] = useState<
    Record<string, { size: string; color: string; weight: string; imageUrl: string }>
  >({});
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const buildAttrs = (size: string, color: string): Record<string, string> => {
    const a: Record<string, string> = {};
    if (size.trim()) a.Size = size.trim();
    if (color.trim()) a.Color = color.trim();
    return a;
  };

  const reload = useCallback(async () => {
    const rows = await adminFetch<VariantRow[]>(`/admin/products/${productId}/variants`).catch(
      () => [] as VariantRow[],
    );
    setVariants(rows);
    const initial: Record<string, { minQty: string; price: string }[]> = {};
    const m: Record<string, { size: string; color: string; weight: string; imageUrl: string }> = {};
    for (const v of rows) {
      initial[v.id] = (v.priceSlabsJson ?? []).map((s) => ({
        minQty: String(s.minQty),
        price: toRupees(s.unitPrice),
      }));
      const attrs = v.attributesJson ?? {};
      m[v.id] = {
        size: attrs.Size ?? '',
        color: attrs.Color ?? '',
        weight: v.weightGrams ? String(v.weightGrams) : '',
        imageUrl: v.imageUrl ?? '',
      };
    }
    setSlabs(initial);
    setMeta(m);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function applyProductTiers() {
    setMsg(null);
    const tiers = productTiers
      .filter((t) => t.minQty && t.discountPct)
      .map((t) => ({ minQty: parseInt(t.minQty, 10), discountPct: parseFloat(t.discountPct) }));
    if (tiers.length === 0) {
      setMsg('Add at least one tier (min qty + discount %).');
      return;
    }
    try {
      const res = await adminFetch<{ updated: number }>(`/admin/products/${productId}/price-slabs`, {
        method: 'POST',
        body: { tiers },
      });
      setMsg(`Applied ${tiers.length} tier(s) to ${res.updated} variant(s).`);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not apply product tiers.');
    }
  }

  async function addVariant() {
    setMsg(null);
    if (!nv.sku || !nv.mrp || !nv.price) {
      setMsg('SKU, MRP and selling price are required.');
      return;
    }
    if (toPaise(nv.price) > toPaise(nv.mrp)) {
      setMsg('Selling price cannot exceed MRP.');
      return;
    }
    try {
      const variant = await adminFetch<{ id: string }>('/admin/variants', {
        method: 'POST',
        body: {
          productId,
          sku: nv.sku,
          mrp: toPaise(nv.mrp),
          sellingPrice: toPaise(nv.price),
          attributes: buildAttrs(nv.size, nv.color),
          weightGrams: parseInt(nv.weight || '0', 10) || 0,
          imageUrl: nv.imageUrl || undefined,
        },
      });
      const qty = parseInt(nv.stock || '0', 10);
      if (qty > 0) {
        await adminFetch(`/admin/inventory/${variant.id}/adjust`, {
          method: 'POST',
          body: { delta: qty, ref: 'add-variant' },
        });
      }
      setNv({ sku: '', mrp: '', price: '', stock: '', size: '', color: '', weight: '', imageUrl: '' });
      setMsg('Variant added.');
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not add variant.');
    }
  }

  const update = (vid: string, rows: { minQty: string; price: string }[]) =>
    setSlabs((s) => ({ ...s, [vid]: rows }));

  async function save(v: VariantRow) {
    setMsg(null);
    const rows = slabs[v.id] ?? [];
    const priceSlabs = rows
      .filter((r) => r.minQty && r.price)
      .map((r) => ({ minQty: parseInt(r.minQty, 10), unitPrice: toPaise(r.price) }));
    const vm = meta[v.id] ?? { size: '', color: '', weight: '', imageUrl: '' };
    try {
      await adminFetch('/admin/variants', {
        method: 'POST',
        body: {
          id: v.id,
          productId: v.productId,
          sku: v.sku,
          mrp: v.mrp,
          sellingPrice: v.sellingPrice,
          attributes: buildAttrs(vm.size, vm.color),
          weightGrams: parseInt(vm.weight || '0', 10) || 0,
          imageUrl: vm.imageUrl || undefined,
          priceSlabs,
        },
      });
      setMsg(`Saved ${v.sku}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save slabs.');
    }
  }

  /**
   * Remove one variant. The server hard-deletes a never-ordered variant and hides +
   * keeps an ordered one for order history. Only this card is dropped locally so
   * unsaved slab/size edits on the other cards survive.
   */
  async function removeVariant(v: VariantRow) {
    const label = variantLabel(v.attributesJson, v.sku);
    if (!window.confirm(removeVariantConfirmText(label))) return;
    setRemovingId(v.id);
    setMsg(null);
    try {
      const res = await adminFetch<{ removed: boolean; mode: RemoveVariantMode }>(
        `/admin/variants/${v.id}`,
        { method: 'DELETE' },
      );
      setVariants((cur) => cur.filter((x) => x.id !== v.id));
      setSlabs((cur) => {
        const next = { ...cur };
        delete next[v.id];
        return next;
      });
      setMeta((cur) => {
        const next = { ...cur };
        delete next[v.id];
        return next;
      });
      setMsg(removeVariantSuccessMessage(label, res.mode));
      onChanged?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not remove variant.');
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) return <p className="slab-editor__hint">Loading variants…</p>;

  return (
    <div className="slab-editor" data-testid="variant-slabs-editor">
      {msg && (
        <p role="status" className="slab-editor__msg">
          {msg}
        </p>
      )}

      {/* Add variant */}
      <div className="slab-editor__product">
        <div className="slab-editor__vhead">
          <strong>Add variant</strong>
          <span>pack / size + price + stock</span>
        </div>
        <div className="addr-grid">
          <div>
            <label className="auth-label">SKU</label>
            <input className="auth-input" value={nv.sku} onChange={(e) => setNv({ ...nv, sku: e.target.value })} data-testid="nv-sku" />
          </div>
          <div>
            <label className="auth-label">MRP (₹)</label>
            <input className="auth-input" type="number" value={nv.mrp} onChange={(e) => setNv({ ...nv, mrp: e.target.value })} />
          </div>
          <div>
            <label className="auth-label">Selling (₹)</label>
            <input className="auth-input" type="number" value={nv.price} onChange={(e) => setNv({ ...nv, price: e.target.value })} />
          </div>
          <div>
            <label className="auth-label">Stock</label>
            <input className="auth-input" type="number" value={nv.stock} onChange={(e) => setNv({ ...nv, stock: e.target.value })} />
          </div>
          <div>
            <label className="auth-label">Size</label>
            <input className="auth-input" value={nv.size} onChange={(e) => setNv({ ...nv, size: e.target.value })} placeholder="M / 500g / …" />
          </div>
          <div>
            <label className="auth-label">Color</label>
            <input className="auth-input" value={nv.color} onChange={(e) => setNv({ ...nv, color: e.target.value })} placeholder="Black" />
          </div>
          <div>
            <label className="auth-label">Weight (g)</label>
            <input className="auth-input" type="number" value={nv.weight} onChange={(e) => setNv({ ...nv, weight: e.target.value })} />
          </div>
          <div>
            <label className="auth-label">Variant image</label>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  try {
                    const { url } = await adminUpload(f, 'products');
                    setNv((n) => ({ ...n, imageUrl: url }));
                  } catch {
                    setMsg('Image upload failed.');
                  }
                }
                e.target.value = '';
              }}
            />
          </div>
        </div>
        {nv.imageUrl && (
          <div className="prod-thumbs">
            <div className="prod-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={nv.imageUrl} alt="" />
              <button type="button" onClick={() => setNv({ ...nv, imageUrl: '' })} aria-label="Remove">✕</button>
            </div>
          </div>
        )}
        <div className="slab-editor__actions">
          <button type="button" className="btn" onClick={addVariant} data-testid="add-variant">
            Add variant
          </button>
        </div>
      </div>

      {variants.length === 0 && (
        <p className="slab-editor__hint">No variants yet — add the first one above.</p>
      )}

      {variants.length > 0 && (
      <div className="slab-editor__product" data-testid="product-tiers">
        <div className="slab-editor__vhead">
          <strong>Product-level tiers</strong>
          <span>% off applied to every variant&apos;s selling price</span>
        </div>
        <table className="slab-editor__table">
          <thead>
            <tr>
              <th>Min qty</th>
              <th>Discount %</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {productTiers.map((t, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="number"
                    min={2}
                    value={t.minQty}
                    onChange={(e) => {
                      const next = [...productTiers];
                      next[i] = { ...next[i], minQty: e.target.value };
                      setProductTiers(next);
                    }}
                    data-testid={`ptier-minqty-${i}`}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={95}
                    step="0.5"
                    value={t.discountPct}
                    onChange={(e) => {
                      const next = [...productTiers];
                      next[i] = { ...next[i], discountPct: e.target.value };
                      setProductTiers(next);
                    }}
                    data-testid={`ptier-pct-${i}`}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="slab-editor__remove"
                    onClick={() => setProductTiers(productTiers.filter((_, j) => j !== i))}
                    aria-label="Remove tier"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="slab-editor__actions">
          <button
            type="button"
            className="slab-editor__add"
            onClick={() => setProductTiers([...productTiers, { minQty: '', discountPct: '' }])}
          >
            + Add tier
          </button>
          <button
            type="button"
            className="btn"
            onClick={applyProductTiers}
            data-testid="ptier-apply"
          >
            Apply to all variants
          </button>
        </div>
      </div>
      )}
      {variants.map((v) => {
        const rows = slabs[v.id] ?? [];
        const label = variantLabel(v.attributesJson, v.sku);
        return (
          <div key={v.id} className="slab-editor__variant">
            <div className="slab-editor__vhead">
              <strong>{label}</strong>
              <span>
                MRP ₹{toRupees(v.mrp)} · Price ₹{toRupees(v.sellingPrice)}
              </span>
            </div>

            <div className="addr-grid">
              <div>
                <label className="auth-label">Size</label>
                <input
                  className="auth-input"
                  value={meta[v.id]?.size ?? ''}
                  onChange={(e) =>
                    setMeta((mm) => ({ ...mm, [v.id]: { ...mm[v.id], size: e.target.value } }))
                  }
                />
              </div>
              <div>
                <label className="auth-label">Color</label>
                <input
                  className="auth-input"
                  value={meta[v.id]?.color ?? ''}
                  onChange={(e) =>
                    setMeta((mm) => ({ ...mm, [v.id]: { ...mm[v.id], color: e.target.value } }))
                  }
                />
              </div>
              <div>
                <label className="auth-label">Weight (g)</label>
                <input
                  className="auth-input"
                  type="number"
                  value={meta[v.id]?.weight ?? ''}
                  onChange={(e) =>
                    setMeta((mm) => ({ ...mm, [v.id]: { ...mm[v.id], weight: e.target.value } }))
                  }
                />
              </div>
              <div>
                <label className="auth-label">Variant image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      try {
                        const { url } = await adminUpload(f, 'products');
                        setMeta((mm) => ({ ...mm, [v.id]: { ...mm[v.id], imageUrl: url } }));
                      } catch {
                        setMsg('Image upload failed.');
                      }
                    }
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
            {meta[v.id]?.imageUrl && (
              <div className="prod-thumbs">
                <div className="prod-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={meta[v.id].imageUrl} alt="" />
                  <button
                    type="button"
                    onClick={() => setMeta((mm) => ({ ...mm, [v.id]: { ...mm[v.id], imageUrl: '' } }))}
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            <table className="slab-editor__table">
              <thead>
                <tr>
                  <th>Min qty</th>
                  <th>Unit price (₹)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="number"
                        min={2}
                        value={r.minQty}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...next[i], minQty: e.target.value };
                          update(v.id, next);
                        }}
                        data-testid={`slab-minqty-${v.sku}-${i}`}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.price}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...next[i], price: e.target.value };
                          update(v.id, next);
                        }}
                        data-testid={`slab-price-${v.sku}-${i}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="slab-editor__remove"
                        onClick={() => update(v.id, rows.filter((_, j) => j !== i))}
                        aria-label="Remove slab"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="slab-editor__actions">
              <button
                type="button"
                className="slab-editor__add"
                onClick={() => update(v.id, [...rows, { minQty: '', price: '' }])}
                data-testid={`slab-add-${v.sku}`}
              >
                + Add slab
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => save(v)}
                data-testid={`slab-save-${v.sku}`}
              >
                Save variant
              </button>
              <button
                type="button"
                className="admin-inline-btn admin-btn--danger"
                onClick={() => removeVariant(v)}
                disabled={removingId !== null}
                aria-label={`Remove variant ${label}`}
                data-testid={`variant-remove-${v.sku}`}
              >
                {removingId === v.id ? 'Removing…' : '🗑 Remove variant'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
