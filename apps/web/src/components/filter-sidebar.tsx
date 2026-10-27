'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { BrandDto } from '@/lib/catalogue-api';
import { activeFilterCount, isPanelOpen, visibleBrands, BRANDS_COLLAPSED } from '@/lib/filter-state';

interface CategoryOpt {
  id: string;
  name: string;
  slug: string;
}
interface PriceRange {
  label: string;
  min?: number;
  max?: number;
}
/** Price bands in paise (sellingPrice is stored in paise). */
const PRICE_RANGES: PriceRange[] = [
  { label: 'Under ₹500', max: 50000 },
  { label: '₹500 – ₹1,000', min: 50000, max: 100000 },
  { label: '₹1,000 – ₹2,000', min: 100000, max: 200000 },
  { label: '₹2,000 – ₹5,000', min: 200000, max: 500000 },
  { label: 'Over ₹5,000', min: 500000 },
];

/**
 * Product filters. On a computer they sit in a column beside the products. On a phone they are behind a
 * "Filters" button and open as a full-screen panel; choosing a brand, price or category (or CLEAR ALL, the
 * Close button or "Show results") closes the panel so the customer lands straight on the results.
 */
export function FilterSidebar({
  basePath,
  categories,
  brands,
  activeSlug,
  activeCategoryName,
}: {
  /** Path filters apply to, e.g. "/category/apparel" or "/search". */
  basePath: string;
  categories: CategoryOpt[];
  brands: BrandDto[];
  /** Slug of the current category (highlighted + excluded from the list). */
  activeSlug?: string;
  activeCategoryName?: string;
}) {
  const params = useSearchParams();
  const brandId = params.get('brandId') ?? '';
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const hasFilters = Boolean(brandId || minPrice || maxPrice);
  const count = activeFilterCount(params);
  const [open, setOpen] = useState<Record<string, boolean>>({
    categories: true,
    brand: true,
    price: true,
  });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const [allBrands, setAllBrands] = useState(false);

  // The phone panel is open for ONE set of filters: it remembers which URL it was opened on, so any change
  // of the filters (a new brand, price or clear) closes it by itself, with no extra effect needed.
  const query = params.toString();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const panelOpen = isPanelOpen(openedOn, query);
  const closePanel = () => setOpenedOn(null);

  // While the panel covers the screen the page behind it must not scroll; Esc closes it.
  useEffect(() => {
    if (!panelOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenedOn(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [panelOpen]);

  /** Build an href on basePath, merging param overrides (null clears). */
  const hrefWith = (overrides: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    const qs = next.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  };
  const priceActive = (r: PriceRange) =>
    String(r.min ?? '') === minPrice && String(r.max ?? '') === maxPrice;

  return (
    <>
      <div className="plp-filterbar">
        <button
          type="button"
          className="plp-filterbar__btn"
          onClick={() => setOpenedOn(query)}
          aria-haspopup="dialog"
          aria-expanded={panelOpen}
          data-testid="filters-open"
        >
          <span aria-hidden="true">☰</span> Filters
          {count > 0 && (
            <em className="plp-filterbar__count" data-testid="filters-count">
              {count}
            </em>
          )}
        </button>
        {hasFilters && (
          <Link
            href={hrefWith({ brandId: null, minPrice: null, maxPrice: null })}
            className="plp-filterbar__clear"
            data-testid="filters-clear-bar"
          >
            Clear
          </Link>
        )}
      </div>
      {panelOpen && <div className="plp-scrim" onClick={closePanel} aria-hidden="true" />}
      <aside
        className={`plp-filters${panelOpen ? ' plp-filters--open' : ''}`}
        data-testid="filter-sidebar"
        role={panelOpen ? 'dialog' : undefined}
        aria-modal={panelOpen ? true : undefined}
        aria-label="Filters"
      >
        <div className="plp-filters__head">
          <span>Filters</span>
          {hasFilters && (
            <Link
              href={hrefWith({ brandId: null, minPrice: null, maxPrice: null })}
              className="plp-filters__clear"
              onClick={closePanel}
              data-testid="filters-clear"
            >
              CLEAR ALL
            </Link>
          )}
          <button type="button" className="plp-filters__close" onClick={closePanel} aria-label="Close filters" data-testid="filters-close">
            ✕
          </button>
        </div>
        <div className="plp-filters__scroll">
          {categories.length > 0 && (
            <section className="filter-group">
              <button className="filter-group__head" onClick={() => toggle('categories')} type="button">
                Categories
                <span className={`chev${open.categories ? ' chev--open' : ''}`}>⌄</span>
              </button>
              {open.categories && (
                <div className="filter-group__body">
                  {activeCategoryName && (
                    <span className="filter-opt filter-opt--current">{activeCategoryName}</span>
                  )}
                  {categories
                    .filter((c) => c.slug !== activeSlug)
                    .map((c) => (
                      <Link key={c.id} href={`/category/${c.slug}`} className="filter-opt" onClick={closePanel}>
                        {c.name}
                      </Link>
                    ))}
                </div>
              )}
            </section>
          )}
          {brands.length > 0 && (
            <section className="filter-group">
              <button className="filter-group__head" onClick={() => toggle('brand')} type="button">
                Brand
                <span className={`chev${open.brand ? ' chev--open' : ''}`}>⌄</span>
              </button>
              {open.brand && (
                <div className="filter-group__body">
                  <div className={`brand-grid${allBrands ? ' brand-grid--all' : ''}`} data-testid="brand-grid">
                    {visibleBrands(brands, brandId, allBrands).map((b) => {
                      const active = b.id === brandId;
                      return (
                        <Link
                          key={b.id}
                          href={hrefWith({ brandId: active ? null : b.id })}
                          className={`brand-chip${active ? ' brand-chip--on' : ''}`}
                          onClick={closePanel}
                          title={b.name}
                          aria-current={active ? 'true' : undefined}
                          data-testid={`filter-brand-${b.slug}`}
                        >
                          {b.name}
                        </Link>
                      );
                    })}
                  </div>
                  {brands.length > BRANDS_COLLAPSED && (
                    <button
                      type="button"
                      className="brand-more"
                      onClick={() => setAllBrands((v) => !v)}
                      aria-expanded={allBrands}
                      data-testid="brand-more"
                    >
                      {allBrands ? 'Show fewer' : `Show all ${brands.length} brands`}
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
          <section className="filter-group">
            <button className="filter-group__head" onClick={() => toggle('price')} type="button">
              Price
              <span className={`chev${open.price ? ' chev--open' : ''}`}>⌄</span>
            </button>
            {open.price && (
              <div className="filter-group__body">
                {PRICE_RANGES.map((r) => {
                  const active = priceActive(r);
                  return (
                    <Link
                      key={r.label}
                      href={hrefWith({
                        minPrice: active ? null : r.min != null ? String(r.min) : null,
                        maxPrice: active ? null : r.max != null ? String(r.max) : null,
                      })}
                      className="filter-opt filter-opt--check"
                      onClick={closePanel}
                    >
                      <span className={`radio${active ? ' radio--on' : ''}`} aria-hidden />
                      {r.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
        <div className="plp-filters__foot">
          <button type="button" className="plp-filters__apply" onClick={closePanel} data-testid="filters-apply">
            Show results
          </button>
        </div>
      </aside>
    </>
  );
}
