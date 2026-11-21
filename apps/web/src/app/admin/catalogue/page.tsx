'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { Pager } from '../pager';
import { formatInr } from '@/lib/catalogue-api';
import { ProductWizard, type CatNode } from './product-wizard';
import { ProductEditor } from './product-editor';
import { VariantSlabsEditor } from './variant-slabs';
import { ExcelDownloadButton } from './excel-download-button';
import { parseOrderLimit, validateOrderLimits } from '@/lib/variant-edit';

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
  /** The default variant's purchase limits (null = none). */
  minOrderQty?: number | null;
  maxOrderQty?: number | null;
}
/** Which products the list shows by stock: every product, only those with stock, or only the ones that ran out. */
type StockFilter = 'all' | 'in' | 'out';
interface Brand {
  id: string;
  name: string;
}
/** Stock totals of the whole catalogue (for the three cards), whatever the search or filter is. */
interface CatalogueStats {
  total: number;
  inStock: number;
  outOfStock: number;
}
/** One page of the table, as GET /admin/products/list returns it. */
interface ProductPage {
  items: ProdRow[];
  /** Products matching the search / filter (not just this page). */
  total: number;
  page: number;
  pageSize: number;
  stats: CatalogueStats;
}



/** Admin Product & Inventory management: dashboard + wizard + edit/stock. */
export default function AdminCataloguePage() {
  const [products, setProducts] = useState<ProdRow[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<CatalogueStats | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CatNode[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pricingId, setPricingId] = useState<string | null>(null);
  const [stockFor, setStockFor] = useState<ProdRow | null>(null);
  // `q` is what the box shows; `search` follows it after a short pause, so a request is not sent for every key.
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Only the newest request may update the screen (a slow earlier one must not overwrite a newer one).
  const latest = useRef(0);

  /** A different page, search or filter shows different rows: forget what was selected or opened. */
  const resetView = useCallback(() => {
    setSelected(new Set());
    setEditId(null);
    setPricingId(null);
  }, []);

  const loadProducts = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), stock: stockFilter });
    if (search) params.set('q', search);
    try {
      const r = await adminFetch<ProductPage>(`/admin/products/list?${params.toString()}`);
      if (id !== latest.current) return;
      setProducts(r.items);
      setTotal(r.total);
      setStats(r.stats);
      setLoadError(null);
      // The server moves to the last page when the asked-for page no longer exists (e.g. its last row was deleted).
      if (r.page !== page) setPage(r.page);
    } catch (e) {
      if (id !== latest.current) return;
      setLoadError(e instanceof Error && e.message ? e.message : 'Could not load the products.');
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [page, pageSize, search, stockFilter]);

  const loadTaxonomy = useCallback(async () => {
    const [c, b] = await Promise.all([
      adminFetch<CatNode[]>('/categories').catch(() => [] as CatNode[]),
      adminFetch<Brand[]>('/brands').catch(() => [] as Brand[]),
    ]);
    setCategories(c);
    setBrands(b);
  }, []);

  /** Reload the table and the category / brand lists (after an edit, a stock change or a bulk action). */
  const load = useCallback(async () => {
    await Promise.all([loadProducts(), loadTaxonomy()]);
  }, [loadProducts, loadTaxonomy]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);
  useEffect(() => {
    void loadTaxonomy();
  }, [loadTaxonomy]);

  const searchRef = useRef('');
  useEffect(() => {
    const t = setTimeout(() => {
      const next = q.trim();
      if (next === searchRef.current) return;
      searchRef.current = next;
      setSearch(next);
      setPage(1);
      resetView();
    }, 300);
    return () => clearTimeout(t);
  }, [q, resetView]);

  function changeStock(next: StockFilter) {
    setStockFilter(next);
    setPage(1);
    resetView();
  }
  function changePage(next: number) {
    setPage(next);
    resetView();
  }
  function changePageSize(next: number) {
    setPageSize(next);
    setPage(1);
    resetView();
  }

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
      const allShown = products.length > 0 && products.every((p) => prev.has(p.id));
      if (allShown) {
        const next = new Set(prev);
        products.forEach((p) => next.delete(p.id));
        return next;
      }
      const next = new Set(prev);
      products.forEach((p) => next.add(p.id));
      return next;
    });
  }
  // A selection only ever covers the rows of the page on screen (it is cleared when the page, search or filter changes).
  const selectedVisible = products.filter((p) => selected.has(p.id)).map((p) => p.id);
  const allFilteredSelected = products.length > 0 && selectedVisible.length === products.length;

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
            {(
              [
                { key: 'all', label: 'Total Products', value: stats?.total, ic: 'a', icon: '📦' },
                { key: 'in', label: 'In Stock', value: stats?.inStock, ic: 'b', icon: '✅' },
                { key: 'out', label: 'Out of Stock', value: stats?.outOfStock, ic: 'c', icon: '⚠' },
              ] as const
            ).map((c) => (
              <button
                key={c.key}
                type="button"
                className={`pm-stat pm-stat--btn${stockFilter === c.key ? ' is-on' : ''}`}
                onClick={() => changeStock(stockFilter === c.key ? 'all' : c.key)}
                aria-pressed={stockFilter === c.key}
                title={c.key === 'all' ? 'Show all products' : `Show only ${c.label.toLowerCase()} products`}
                data-testid={`pm-stat-${c.key}`}
              >
                <span className="pm-stat__label">{c.label}</span>
                <span className="pm-stat__value">{c.value ?? '—'}</span>
                <span className={`pm-stat__ic pm-stat__ic--${c.ic}`}>{c.icon}</span>
              </button>
            ))}
          </div>
          <div className="pm-filterbar">
            <input
              className="pm-search"
              placeholder="Search by name, SKU or slug…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="pm-search"
            />
            <div className="pm-filter" role="group" aria-label="Filter by stock" data-testid="pm-stock-filter">
              {(
                [
                  { key: 'all', label: 'All', n: stats?.total },
                  { key: 'in', label: 'In stock', n: stats?.inStock },
                  { key: 'out', label: 'Out of stock', n: stats?.outOfStock },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`pm-filter__btn${stockFilter === f.key ? ' is-on' : ''}${f.key === 'out' ? ' pm-filter__btn--out' : ''}`}
                  onClick={() => changeStock(f.key)}
                  aria-pressed={stockFilter === f.key}
                  data-testid={`pm-filter-${f.key}`}
                >
                  {f.label} <span>{f.n ?? '—'}</span>
                </button>
              ))}
            </div>
          </div>
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

          {loadError && (
            <div className="admin-empty pm-error" role="alert" data-testid="pm-error">
              <p>Could not load the products: {loadError}</p>
              <button type="button" className="auth-btn" onClick={() => void loadProducts()} data-testid="pm-retry">
                Try again
              </button>
            </div>
          )}
          <div className={`pm-tablewrap${loading && products.length > 0 ? ' is-loading' : ''}`} aria-busy={loading}>
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
              {products.map((p) => (
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
                      <span className={p.stock > 0 ? 'pm-stock' : 'pm-stock pm-stock--out'} data-testid={`stock-label-${p.slug}`}>
                        {p.stock > 0 ? `${p.stock} qty` : 'Out of stock'}
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
              {loading && products.length === 0 && !loadError &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={`sk-${i}`} className="pm-skel" aria-hidden data-testid="pm-skeleton">
                    <td colSpan={8}>
                      <span className="pm-skel__bar" />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          </div>
          {!loading && !loadError && products.length === 0 && (
            <div className="admin-empty" data-testid="pm-empty">
              {stockFilter === 'out' && !search
                ? 'No product is out of stock.'
                : stats?.total === 0
                  ? 'No products yet. Add your first product.'
                  : 'No products match this search or filter.'}
            </div>
          )}
          {total > 0 && (
            <Pager page={page} pageSize={pageSize} total={total} onPage={changePage} onPageSize={changePageSize} busy={loading} />
          )}
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
  const [minQty, setMinQty] = useState(product.minOrderQty == null ? '' : String(product.minOrderQty));
  const [maxQty, setMaxQty] = useState(product.maxOrderQty == null ? '' : String(product.maxOrderQty));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!product.defaultVariantId) {
      setErr('This product has no variant yet. Add a variant first.');
      return;
    }
    const limitProblem = validateOrderLimits(minQty, maxQty);
    if (limitProblem) {
      setErr(limitProblem);
      return;
    }
    const target = parseInt(qty || '0', 10);
    const delta = target - product.stock;
    const nextMin = parseOrderLimit(minQty);
    const nextMax = parseOrderLimit(maxQty);
    const limitsChanged =
      nextMin !== (product.minOrderQty ?? null) || nextMax !== (product.maxOrderQty ?? null);
    setBusy(true);
    setErr(null);
    try {
      if (limitsChanged) {
        await adminFetch(`/admin/variants/${product.defaultVariantId}/order-limits`, {
          method: 'PATCH',
          body: { minOrderQty: nextMin, maxOrderQty: nextMax },
        });
      }
      if (delta !== 0) {
        await adminFetch(`/admin/inventory/${product.defaultVariantId}/adjust`, {
          method: 'POST',
          body: { delta, ref: 'manual-update' },
        });
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'Could not update stock.');
    } finally {
      setBusy(false);
    }
  }

  // A minimum above the stock on hand means nobody can order it until stock is added.
  const minNum = parseOrderLimit(minQty);
  const stockNum = parseInt(qty || '0', 10);
  const minAboveStock = minNum !== null && Number.isFinite(minNum) && Number.isFinite(stockNum) && minNum > stockNum;

  return (
    <div className="pm-modal" role="dialog" aria-modal="true" data-testid="update-stock-modal">
      <div className="pm-modal__card">
        <h3>Update Stock</h3>
        <p className="admin-muted">{product.title}</p>
        {err && <p className="prod-form__msg prod-form__msg--err" role="alert">{err}</p>}
        <label className="auth-label">Available quantity</label>
        <input className="auth-input" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} data-testid="update-stock-input" autoFocus />
        <div className="prod-grid" style={{ marginTop: 12 }}>
          <div>
            <label className="auth-label">Min order qty</label>
            <input
              className="auth-input"
              type="number"
              min={1}
              max={99}
              step={1}
              placeholder="1"
              value={minQty}
              onChange={(e) => setMinQty(e.target.value)}
              data-testid="update-stock-min"
            />
          </div>
          <div>
            <label className="auth-label">Max order qty</label>
            <input
              className="auth-input"
              type="number"
              min={1}
              max={99}
              step={1}
              placeholder="no limit"
              value={maxQty}
              onChange={(e) => setMaxQty(e.target.value)}
              data-testid="update-stock-max"
            />
          </div>
        </div>
        <p className="prod-form__hint">
          The fewest and most units one customer can buy in a single order. Leave blank for no limit.
        </p>
        {minAboveStock && (
          <p className="prod-form__msg prod-form__msg--err" role="alert">
            Min order qty is more than the stock, so customers cannot order this until you add stock.
          </p>
        )}
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
