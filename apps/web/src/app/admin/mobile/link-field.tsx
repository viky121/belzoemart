'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { PRODUCTS_LINK_MAX, PRODUCTS_LINK_TITLE_MAX, parseProductsLink, productsLinkHref } from '@belzo/shared';
import { adminFetch } from '@/lib/admin-api';

export interface LinkCategory {
  slug: string;
  label: string;
}

type Mode = 'none' | 'category' | 'search' | 'products' | 'custom';

/** "Selected products" link with nothing picked yet (keeps the mode open while the admin picks). */
const EMPTY_PRODUCTS_LINK = '/products?ids=';

function modeOf(value: string, cats: LinkCategory[]): Mode {
  if (!value || value === '#') return 'none';
  const m = /^\/category\/([^/?#]+)$/.exec(value);
  if (m && cats.some((c) => c.slug === m[1])) return 'category';
  if (value.startsWith('/search?q=')) return 'search';
  if (value.startsWith('/products?ids=')) return 'products';
  return 'custom';
}

interface PickRow {
  id: string;
  title: string;
}

/** The admin product list is fetched once and shared by every picker on the page. */
let productsPromise: Promise<PickRow[]> | null = null;
function loadProducts(): Promise<PickRow[]> {
  productsPromise ??= adminFetch<PickRow[]>('/admin/products')
    .then((rows) => rows.map((r) => ({ id: r.id, title: r.title })))
    .catch(() => {
      productsPromise = null; // let the next open try again
      return [];
    });
  return productsPromise;
}

/** Pick several products; tapping the banner opens a page listing exactly these products. */
function ProductsLinkPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = useMemo(() => parseProductsLink(value), [value]);
  const ids = useMemo(() => parsed?.ids ?? [], [parsed]);
  const [title, setTitle] = useState(() => parsed?.title ?? '');
  const [filter, setFilter] = useState('');
  const [all, setAll] = useState<PickRow[] | null>(null);

  useEffect(() => {
    let live = true;
    void loadProducts().then((rows) => live && setAll(rows));
    return () => {
      live = false;
    };
  }, []);

  const emit = (nextIds: string[], nextTitle: string) =>
    onChange(nextIds.length > 0 ? productsLinkHref(nextIds, nextTitle) : EMPTY_PRODUCTS_LINK);

  const byId = useMemo(() => new Map((all ?? []).map((p) => [p.id, p])), [all]);
  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q || !all) return [];
    return all.filter((p) => p.title.toLowerCase().includes(q) && !ids.includes(p.id)).slice(0, 8);
  }, [filter, all, ids]);

  const move = (i: number, j: number) => {
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j]!, next[i]!];
    emit(next, title);
  };

  return (
    <div className="mh-pick" data-testid="products-link-picker">
      <label className="auth-label">Page heading (optional)</label>
      <input
        className="auth-input"
        maxLength={PRODUCTS_LINK_TITLE_MAX}
        placeholder="e.g. Sugar offers"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          emit(ids, e.target.value);
        }}
      />

      <label className="auth-label">Add products (search by title)</label>
      <input
        className="auth-input"
        aria-label="Search products"
        placeholder={all === null ? 'Loading products…' : 'Type to search products…'}
        value={filter}
        disabled={ids.length >= PRODUCTS_LINK_MAX}
        onChange={(e) => setFilter(e.target.value)}
      />
      {all !== null && all.length === 0 && (
        <span className="prod-form__hint">Could not load the product list. Reload the page to try again.</span>
      )}
      {filter.trim() !== '' && all !== null && all.length > 0 && matches.length === 0 && (
        <span className="prod-form__hint">No matching products.</span>
      )}
      {matches.length > 0 && (
        <div className="mh-pick__results" role="listbox" aria-label="Matching products">
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={false}
              className="mh-pick__result"
              onClick={() => {
                emit([...ids, p.id], title);
                setFilter('');
              }}
            >
              + {p.title}
            </button>
          ))}
        </div>
      )}

      {ids.length === 0 ? (
        <span className="prod-form__hint">No products picked yet. Add at least one, or the banner will do nothing.</span>
      ) : (
        <>
          <span className="prod-form__hint">
            {ids.length} of {PRODUCTS_LINK_MAX} products. Tapping the banner opens a page with these.
          </span>
          <ol className="mh-pick__list">
            {ids.map((id, i) => (
              <li className="mh-pick__item" key={id}>
                <span className="mh-pick__no" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="mh-pick__title">
                  {byId.get(id)?.title ?? (all === null ? 'Loading…' : 'Product not found')}
                </span>
                <button
                  type="button"
                  className="mh-pick__btn"
                  disabled={i === 0}
                  aria-label="Move product up"
                  onClick={() => move(i, i - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="mh-pick__btn"
                  disabled={i === ids.length - 1}
                  aria-label="Move product down"
                  onClick={() => move(i, i + 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="mh-pick__btn mh-pick__btn--del"
                  aria-label="Remove product"
                  onClick={() => emit(ids.filter((x) => x !== id), title)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

/**
 * "Where does this banner go?" picker. Produces an in-app path the mobile app
 * understands (/category/<slug>, /search?q=…, /products?ids=…, /product/<slug>, /orders …)
 * or a full https:// URL. '#' means not tappable.
 */
export function LinkField({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (v: string) => void;
  categories: LinkCategory[];
}) {
  const id = useId();
  const mode = modeOf(value, categories);

  const setMode = (m: Mode) => {
    if (m === 'none') onChange('#');
    else if (m === 'category') onChange(categories[0] ? `/category/${categories[0].slug}` : '#');
    else if (m === 'search') onChange('/search?q=');
    else if (m === 'products') onChange(EMPTY_PRODUCTS_LINK);
    else onChange(mode === 'custom' ? value : '/');
  };

  return (
    <div className="mh-link">
      <label className="auth-label" htmlFor={id}>
        Tap action
      </label>
      <select id={id} className="auth-input" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
        <option value="none">Nothing (image only)</option>
        <option value="category">Open a category</option>
        <option value="search">Search for…</option>
        <option value="products">Show selected products</option>
        <option value="custom">Custom link</option>
      </select>

      {mode === 'category' && (
        <select
          className="auth-input"
          aria-label="Category"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c.slug} value={`/category/${c.slug}`}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      {mode === 'search' && (
        <input
          className="auth-input"
          aria-label="Search text"
          placeholder="e.g. atta"
          value={decodeURIComponent(value.replace('/search?q=', ''))}
          onChange={(e) => onChange(`/search?q=${encodeURIComponent(e.target.value)}`)}
        />
      )}
      {mode === 'products' && <ProductsLinkPicker value={value} onChange={onChange} />}
      {mode === 'custom' && (
        <>
          <input
            className="auth-input"
            aria-label="Custom link"
            placeholder="/product/<slug> · /search?sort=discount · https://…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="prod-form__hint">
            Use an app path like /product/&lt;slug&gt;, /orders, /wishlist or a full https:// link.
          </span>
        </>
      )}
    </div>
  );
}
