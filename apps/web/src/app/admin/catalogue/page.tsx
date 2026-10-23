'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { formatInr } from '@/lib/catalogue-api';
import { ProductWizard, type CatNode } from './product-wizard';
import { ProductEditor } from './product-editor';
import { VariantSlabsEditor } from './variant-slabs';
import { ExcelDownloadButton } from './excel-download-button';

interface ProdRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  brand: string | null;
  imageUrl: string | null;
  mrp: number;
  sellingPrice: number;
  variantCount: number;
  stock: number;
  defaultVariantId: string | null;
}
interface Brand {
  id: string;
  name: string;
}



/** Admin Product & Inventory management: dashboard + wizard + edit/stock. */
export default function AdminCataloguePage() {
  const [products, setProducts] = useState<ProdRow[]>([]);
  const [categories, setCategories] = useState<CatNode[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pricingId, setPricingId] = useState<string | null>(null);
  const [stockFor, setStockFor] = useState<ProdRow | null>(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [p, c, b] = await Promise.all([
      adminFetch<ProdRow[]>('/admin/products').catch(() => [] as ProdRow[]),
      adminFetch<CatNode[]>('/categories').catch(() => [] as CatNode[]),
      adminFetch<Brand[]>('/brands').catch(() => [] as Brand[]),
    ]);
    setProducts(p);
    setCategories(c);
    setBrands(b);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: 'published' | 'draft' | 'archived') {
    try {
      await adminFetch(`/admin/products/${id}/status`, { method: 'PATCH', body: { status } });
      setMsg(`Product ${status}.`);
      void load();
    } catch {
      setMsg('Could not change status — a product needs at least one variant to publish.');
    }
  }

  async function removeProduct(id: string, title: string) {
    if (!window.confirm(`Delete "${title}" permanently? This cannot be undone.`)) return;
    try {
      await adminFetch(`/admin/products/${id}`, { method: 'DELETE' });
      setMsg(`Deleted "${title}".`);
      setEditId(null);
      setPricingId(null);
      void load();
    } catch {
      setMsg('Could not delete product.');
    }
  }

  const total = products.length;
  const inStock = products.filter((p) => p.stock > 0).length;
  const outOfStock = total - inStock;
  const filtered = products.filter(
    (p) => !q || p.title.toLowerCase().includes(q.toLowerCase()) || p.slug.toLowerCase().includes(q.toLowerCase()),
  );

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      const allShown = filtered.length > 0 && filtered.every((p) => prev.has(p.id));
      if (allShown) {
        const next = new Set(prev);
        filtered.forEach((p) => next.delete(p.id));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach((p) => next.add(p.id));
      return next;
    });
  }
  // Only count/act on selections that are still visible under the current search.
  const selectedVisible = filtered.filter((p) => selected.has(p.id)).map((p) => p.id);
  const allFilteredSelected = filtered.length > 0 && selectedVisible.length === filtered.length;

  return (
    <div data-testid="admin-catalogue">
      <div className="pm-head">
        <div>
          <h1>Product &amp; Inventory Management</h1>
          <p className="admin-muted">Manage your catalogue, stock and product details.</p>
        </div>
        {!adding && (
          <div style={{ display: 'flex', gap: 10 }}>
            <a href="/admin/catalogue/bulk" className="admin-inline-btn" style={{ padding: '10px 16px' }} data-testid="pm-bulk">
              ⬆ Bulk upload
            </a>
            <ExcelDownloadButton className="admin-inline-btn" style={{ padding: '10px 16px' }} />
            <button className="pm-add" onClick={() => setAdding(true)} data-testid="pm-add-product">
              + Add Product
            </button>
          </div>
        )}
      </div>

      {msg && (
        <p role="status" className="catalogue-msg" data-testid="catalogue-msg">
          {msg}
        </p>
      )}

      {adding ? (
        <ProductWizard
          categories={categories}
          brands={brands}
          onCancel={() => setAdding(false)}
          onCategoriesChanged={() => {
            setMsg('Category updated.');
            void load();
          }}
          onBrandsChanged={() => {
            setMsg('Brand added.');
            void load();
          }}
          onCreated={() => {
            setAdding(false);
            setMsg('Product saved.');
            void load();
          }}
        />
      ) : (
        <>
          <div className="pm-stats" data-testid="pm-stats">
            <div className="pm-stat">
              <span className="pm-stat__label">Total Products</span>
              <span className="pm-stat__value">{total}</span>
              <span className="pm-stat__ic pm-stat__ic--a">📦</span>
            </div>
            <div className="pm-stat">
              <span className="pm-stat__label">In Stock</span>
              <span className="pm-stat__value">{inStock}</span>
              <span className="pm-stat__ic pm-stat__ic--b">✅</span>
            </div>
            <div className="pm-stat">
              <span className="pm-stat__label">Out of Stock</span>
              <span className="pm-stat__value">{outOfStock}</span>
              <span className="pm-stat__ic pm-stat__ic--c">⚠️</span>
            </div>
          </div>

          <input
            className="pm-search"
            placeholder="Search products, SKU…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="pm-search"
          />

          {selectedVisible.length > 0 && (
            <BulkActionBar
              count={selectedVisible.length}
              productIds={selectedVisible}
              onClear={() => setSelected(new Set())}
              onDone={(summary) => {
                setMsg(summary);
                setSelected(new Set());
                void load();
              }}
            />
          )}

          <table className="admin-table" data-testid="catalogue-products">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all products"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    data-testid="pm-select-all"
                  />
                </th>
                <th></th>
                <th>Title</th>
                <th>MRP</th>
                <th>Selling</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <Fragment key={p.id}>
                  <tr className={selected.has(p.id) ? 'pm-row--selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.title}`}
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        data-testid={`select-${p.slug}`}
                      />
                    </td>
                    <td>
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} className="admin-thumb" alt="" />
                      ) : (
                        <span className="admin-thumb admin-thumb--ph" />
                      )}
                    </td>
                    <td>
                      {p.title}
                      {p.brand ? <span className="admin-muted"> · {p.brand}</span> : ''}
                      <br />
                      <span className="admin-muted" style={{ fontSize: '0.72rem' }}>{p.slug}</span>
                    </td>
                    <td>{p.variantCount ? formatInr(p.mrp) : '—'}</td>
                    <td>{p.variantCount ? formatInr(p.sellingPrice) : '—'}</td>
                    <td>
                      <span className={p.stock > 0 ? 'pm-stock' : 'pm-stock pm-stock--out'}>
                        {p.stock} qty
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge status-badge--${p.status}`}>{p.status}</span>
                    </td>
                    <td className="admin-actions">
                      <button
                        onClick={() => {
                          setEditId(editId === p.id ? null : p.id);
                          setPricingId(null);
                        }}
                        data-testid={`edit-${p.slug}`}
                      >
                        {editId === p.id ? 'Close' : 'Edit'}
                      </button>
                      <button onClick={() => setStockFor(p)} data-testid={`stock-${p.slug}`}>
                        Update Stock
                      </button>
                      <button
                        onClick={() => {
                          setPricingId(pricingId === p.id ? null : p.id);
                          setEditId(null);
                        }}
                      >
                        Variants &amp; pricing
                      </button>
                      {p.status === 'published' ? (
                        <button onClick={() => setStatus(p.id, 'draft')}>Unpublish</button>
                      ) : (
                        <button onClick={() => setStatus(p.id, 'published')} data-testid={`publish-${p.slug}`}>
                          Publish
                        </button>
                      )}
                      <button className="admin-btn--danger" onClick={() => removeProduct(p.id, p.title)} data-testid={`delete-${p.slug}`}>
                        Remove
                      </button>
                    </td>
                  </tr>
                  {editId === p.id && (
                    <tr>
                      <td colSpan={8}>
                        <ProductEditor productId={p.id} categories={categories} brands={brands} onSaved={() => load()} />
                      </td>
                    </tr>
                  )}
                  {pricingId === p.id && (
                    <tr>
                      <td colSpan={8}>
                        <VariantSlabsEditor productId={p.id} onChanged={() => load()} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}

      {stockFor && (
        <UpdateStockModal
          product={stockFor}
          onClose={() => setStockFor(null)}
          onDone={() => {
            setStockFor(null);
            setMsg('Stock updated.');
            void load();
          }}
        />
      )}
    </div>
  );
}

type BulkAction =
  | 'offer-percent'
  | 'offer-fixed'
  | 'price'
  | 'stock-set'
  | 'stock-increase'
  | 'stock-decrease';

interface BulkEditResult {
  ok: number;
  failed: number;
  results: { id: string; title: string; ok: boolean; message?: string }[];
}

/**
 * Bulk action bar for the catalogue table. Lets an admin apply one change to
 * all selected products: an offer (% or ₹ off MRP), an absolute selling price,
 * or a stock update (set / increase / decrease). Price inputs are entered in
 * rupees and sent to the API in paise; percentage/quantity are sent as-is.
 */
function BulkActionBar({
  count,
  productIds,
  onClear,
  onDone,
}: {
  count: number;
  productIds: string[];
  onClear: () => void;
  onDone: (summary: string) => void;
}) {
  const [action, setAction] = useState<BulkAction>('offer-percent');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unit =
    action === 'offer-percent' ? '%' : action === 'offer-fixed' || action === 'price' ? '₹' : 'qty';
  const isMoney = action === 'offer-fixed' || action === 'price';

  function buildOperation(num: number) {
    switch (action) {
      case 'offer-percent':
        return { kind: 'offer' as const, mode: 'percent' as const, value: num };
      case 'offer-fixed':
        return { kind: 'offer' as const, mode: 'fixed' as const, value: Math.round(num * 100) };
      case 'price':
        return { kind: 'price' as const, value: Math.round(num * 100) };
      case 'stock-set':
        return { kind: 'stock' as const, mode: 'set' as const, value: Math.round(num) };
      case 'stock-increase':
        return { kind: 'stock' as const, mode: 'increase' as const, value: Math.round(num) };
      case 'stock-decrease':
        return { kind: 'stock' as const, mode: 'decrease' as const, value: Math.round(num) };
    }
  }

  async function apply() {
    const num = Number(value);
    if (value.trim() === '' || Number.isNaN(num) || num < 0) {
      setErr('Enter a valid non-negative value.');
      return;
    }
    if (action === 'offer-percent' && num > 95) {
      setErr('Discount must be between 0 and 95%.');
      return;
    }
    const verb = isMoney ? `₹${num}` : action === 'offer-percent' ? `${num}%` : `${num}`;
    if (!window.confirm(`Apply this change (${verb}) to ${count} selected product(s)?`)) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await adminFetch<BulkEditResult>('/admin/products/bulk-edit', {
        method: 'POST',
        body: { productIds, operation: buildOperation(num) },
      });
      let summary = `${res.ok} product(s) updated` + (res.failed ? `, ${res.failed} failed` : '.');
      if (res.failed) {
        const first = res.results.find((r) => !r.ok);
        if (first?.message) summary += ` — e.g. "${first.title}": ${first.message}`;
      }
      onDone(summary);
    } catch {
      setErr('Bulk update failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pm-bulkbar" data-testid="bulk-action-bar">
      <span className="pm-bulkbar__count">{count} selected</span>
      <select
        className="auth-input"
        value={action}
        onChange={(e) => setAction(e.target.value as BulkAction)}
        data-testid="bulk-action-select"
        aria-label="Bulk action"
      >
        <optgroup label="Offer (off MRP)">
          <option value="offer-percent">Apply % discount</option>
          <option value="offer-fixed">Apply ₹ discount</option>
        </optgroup>
        <optgroup label="Price">
          <option value="price">Set selling price (₹)</option>
        </optgroup>
        <optgroup label="Stock">
          <option value="stock-set">Set stock to</option>
          <option value="stock-increase">Increase stock by</option>
          <option value="stock-decrease">Decrease stock by</option>
        </optgroup>
      </select>
      <div className="pm-bulkbar__field">
        <input
          className="auth-input"
          type="number"
          min={0}
          step={isMoney ? '0.01' : '1'}
          placeholder={unit}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          data-testid="bulk-action-value"
          aria-label={`Value (${unit})`}
        />
        <span className="pm-bulkbar__unit">{unit}</span>
      </div>
      <button className="wiz__next" onClick={apply} disabled={busy} data-testid="bulk-action-apply">
        {busy ? 'Applying…' : 'Apply'}
      </button>
      <button className="wiz__ghost" onClick={onClear} disabled={busy}>
        Clear
      </button>
      {err && <span className="pm-bulkbar__err">{err}</span>}
    </div>
  );
}

/** Modal to set a product's stock (adjusts the default variant to the target qty). */
function UpdateStockModal({
  product,
  onClose,
  onDone,
}: {
  product: ProdRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState(String(product.stock));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!product.defaultVariantId) {
      setErr('This product has no variant yet. Add a variant first.');
      return;
    }
    const target = parseInt(qty || '0', 10);
    const delta = target - product.stock;
    setBusy(true);
    try {
      if (delta !== 0) {
        await adminFetch(`/admin/inventory/${product.defaultVariantId}/adjust`, {
          method: 'POST',
          body: { delta, ref: 'manual-update' },
        });
      }
      onDone();
    } catch {
      setErr('Could not update stock.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pm-modal" role="dialog" aria-modal="true" data-testid="update-stock-modal">
      <div className="pm-modal__card">
        <h3>Update Stock</h3>
        <p className="admin-muted">{product.title}</p>
        {err && <p className="prod-form__msg">{err}</p>}
        <label className="auth-label">Available quantity</label>
        <input className="auth-input" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} data-testid="update-stock-input" autoFocus />
        <div className="pm-modal__actions">
          <button className="wiz__ghost" onClick={onClose}>Cancel</button>
          <button className="wiz__next" onClick={save} disabled={busy} data-testid="update-stock-save">
            {busy ? 'Saving…' : 'Save Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}
