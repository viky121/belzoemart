import Link from 'next/link';
import { catalogueApi, type Paginated, type BrandDto } from '@/lib/catalogue-api';
import { ProductCard } from '@/components/product-card';
import { FilterSidebar } from '@/components/filter-sidebar';
import type { CategoryNodeDto, ProductCardDto } from '@belzo/shared';

export const dynamic = 'force-dynamic';

const SORTS: { value: string; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'price_asc', label: 'Price -- Low to High' },
  { value: 'price_desc', label: 'Price -- High to Low' },
  { value: 'newest', label: 'Newest First' },
];

const EMPTY: Paginated<ProductCardDto> = { items: [], total: 0, page: 1, pageSize: 20 };

interface SearchParams {
  q?: string;
  sort?: string;
  brandId?: string;
  minPrice?: string;
  maxPrice?: string;
}

/** Search results page (FR-2.3) — Flipkart-style: filters + sort + grid. */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const q = (searchParams.q ?? '').trim();
  const sort = searchParams.sort ?? 'relevance';

  const [categories, brands] = await Promise.all([
    catalogueApi.categories().catch(() => [] as CategoryNodeDto[]),
    catalogueApi.brands().catch(() => [] as BrandDto[]),
  ]);

  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  qs.set('sort', sort);
  if (searchParams.brandId) qs.set('brandId', searchParams.brandId);
  if (searchParams.minPrice) qs.set('minPrice', searchParams.minPrice);
  if (searchParams.maxPrice) qs.set('maxPrice', searchParams.maxPrice);

  // With a query → text search. Without → browse all products (sort/filter still
  // apply), so links like "Deals of the Day" (?sort=discount) show real results.
  const data = q
    ? await catalogueApi.search(qs.toString()).catch(() => EMPTY)
    : await catalogueApi.products(qs.toString()).catch(() => EMPTY);

  // A brand link from a product page lands here with ?brandId=, so name the brand in the heading.
  const brandName = searchParams.brandId ? brands.find((b) => b.id === searchParams.brandId)?.name : undefined;
  const heading = q
    ? `Results for “${q}”`
    : brandName
      ? brandName
      : sort === 'discount'
      ? 'Deals of the Day'
      : sort === 'newest'
        ? 'New Arrivals'
        : 'All products';

  const sortHref = (value: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    sp.set('sort', value);
    if (searchParams.brandId) sp.set('brandId', searchParams.brandId);
    if (searchParams.minPrice) sp.set('minPrice', searchParams.minPrice);
    if (searchParams.maxPrice) sp.set('maxPrice', searchParams.maxPrice);
    return `/search?${sp.toString()}`;
  };

  return (
    <div className="plp" data-testid="search-page">
      <FilterSidebar
        basePath="/search"
        categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        brands={brands}
      />

      <main className="plp-main">
        <nav className="plp-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>›</span>
          <span className="plp-breadcrumb__current">Search</span>
        </nav>

        <div className="plp-heading">
          <h1>{heading}</h1>
          <span className="plp-count">
            (Showing {data.items.length} of {data.total} products)
          </span>
        </div>

        {data.items.length > 0 && (
          <div className="plp-sortbar" data-testid="sort-bar">
            <span className="plp-sortbar__label">Sort By</span>
            {SORTS.map((s) => (
              <Link
                key={s.value}
                href={sortHref(s.value)}
                className={`plp-sort${s.value === sort ? ' plp-sort--active' : ''}`}
                data-testid={`sort-${s.value}`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        )}

        {data.items.length === 0 ? (
          <div className="plp-empty" data-testid="search-empty">
            {q ? (
              <>
                <p>Hmm, we couldn&apos;t find anything for “{q}”.</p>
                <p className="plp-empty__hint">Try a different keyword or check the spelling.</p>
              </>
            ) : (
              <p>No products available right now.</p>
            )}
          </div>
        ) : (
          <div className="product-grid" data-testid="search-results">
            {data.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
