'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { BrandDto } from '@/lib/catalogue-api';

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

  const [open, setOpen] = useState<Record<string, boolean>>({
    categories: true,
    brand: true,
    price: true,
  });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

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
    <aside className="plp-filters" data-testid="filter-sidebar">
      <div className="plp-filters__head">
        <span>Filters</span>
        {hasFilters && (
          <Link
            href={hrefWith({ brandId: null, minPrice: null, maxPrice: null })}
            className="plp-filters__clear"
            data-testid="filters-clear"
          >
            CLEAR ALL
          </Link>
        )}
      </div>

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
                  <Link key={c.id} href={`/category/${c.slug}`} className="filter-opt">
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
              {brands.map((b) => {
                const active = b.id === brandId;
                return (
                  <Link
                    key={b.id}
                    href={hrefWith({ brandId: active ? null : b.id })}
                    className="filter-opt filter-opt--check"
                    data-testid={`filter-brand-${b.slug}`}
                  >
                    <span className={`box${active ? ' box--on' : ''}`} aria-hidden>
                      {active ? '✓' : ''}
                    </span>
                    {b.name}
                  </Link>
                );
              })}
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
                >
                  <span className={`radio${active ? ' radio--on' : ''}`} aria-hidden />
                  {r.label}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </aside>
  );
}
