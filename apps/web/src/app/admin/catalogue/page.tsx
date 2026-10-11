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

          <table className="admin-table" data-testid="catalogue-products">
            <thead>
              <tr>
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
                  <tr>
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
                      <td colSpan={7}>
                        <ProductEditor productId={p.id} categories={categories} brands={brands} onSaved={() => load()} />
                      </td>
                    </tr>
                  )}
                  {pricingId === p.id && (
                    <tr>
                      <td colSpan={7}>
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
