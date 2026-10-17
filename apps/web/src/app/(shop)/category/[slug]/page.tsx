import Link from 'next/link';
import { catalogueApi, type Paginated, type BrandDto } from '@/lib/catalogue-api';
import { ProductCard } from '@/components/product-card';
import { FilterSidebar } from '@/components/filter-sidebar';
import { iconFor, gradientFor, isUsableImageUrl } from '@/lib/category-theme';
import { categoryNav } from '@/lib/category-trail';
import type { CategoryNodeDto, ProductCardDto } from '@belzo/shared';

export const dynamic = 'force-dynamic';

const SORTS: { value: string; label: string }[] = [
  { value: 'popularity', label: 'Popularity' },
  { value: 'price_asc', label: 'Price -- Low to High' },
  { value: 'price_desc', label: 'Price -- High to Low' },
  { value: 'newest', label: 'Newest First' },
];

function findCategory(nodes: CategoryNodeDto[], slug: string): CategoryNodeDto | null {
  for (const n of nodes) {
    if (n.slug === slug) return n;
    const found = findCategory(n.children, slug);
    if (found) return found;
  }
  return null;
}

const EMPTY: Paginated<ProductCardDto> = { items: [], total: 0, page: 1, pageSize: 20 };

interface SearchParams {
  sort?: string;
  brandId?: string;
  minPrice?: string;
  maxPrice?: string;
}

/** Flipkart-style category listing: left filter rail + sort bar + product grid. */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: SearchParams;
}) {
  const [categories, brands] = await Promise.all([
    catalogueApi.categories().catch(() => [] as CategoryNodeDto[]),
    catalogueApi.brands().catch(() => [] as BrandDto[]),
  ]);
  const category = findCategory(categories, params.slug);
  const nav = categoryNav(categories, params.slug);
  const sort = searchParams.sort ?? 'popularity';

  const qs = new URLSearchParams();
  if (category) qs.set('categoryId', category.id);
  qs.set('sort', sort);
  if (searchParams.brandId) qs.set('brandId', searchParams.brandId);
  if (searchParams.minPrice) qs.set('minPrice', searchParams.minPrice);
  if (searchParams.maxPrice) qs.set('maxPrice', searchParams.maxPrice);
  const data = await catalogueApi.products(qs.toString()).catch(() => EMPTY);

  // Build a sort href that preserves the active filters.
  const sortHref = (value: string) => {
    const sp = new URLSearchParams();
    sp.set('sort', value);
    if (searchParams.brandId) sp.set('brandId', searchParams.brandId);
    if (searchParams.minPrice) sp.set('minPrice', searchParams.minPrice);
    if (searchParams.maxPrice) sp.set('maxPrice', searchParams.maxPrice);
    return `/category/${params.slug}?${sp.toString()}`;
  };

  const title = category?.name ?? 'Products';

  return (
    <div className="plp" data-testid="category-page">
      <FilterSidebar
        basePath={`/category/${params.slug}`}
        activeSlug={params.slug}
        categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        brands={brands}
        activeCategoryName={category?.name}
      />

      <main className="plp-main">
        {nav.parent && (
          <Link href={`/category/${nav.parent.slug}`} className="plp-back" data-testid="category-back">
            <span aria-hidden="true">←</span> Back to {nav.parent.name}
          </Link>
        )}
        <nav className="plp-breadcrumb" aria-label="Breadcrumb" data-testid="category-breadcrumb">
          <Link href="/">Home</Link>
          {nav.crumbs.length === 0 ? (
            <>
              <span aria-hidden="true">›</span>
              <span className="plp-breadcrumb__current" aria-current="page">
                {title}
              </span>
            </>
          ) : (
            nav.crumbs.map((c, i) => {
              const last = i === nav.crumbs.length - 1;
              return (
                <span key={c.id} className="plp-breadcrumb__item">
                  <span aria-hidden="true">›</span>
                  {last ? (
                    <span className="plp-breadcrumb__current" aria-current="page">
                      {c.name}
                    </span>
                  ) : (
                    <Link href={`/category/${c.slug}`}>{c.name}</Link>
                  )}
                </span>
              );
            })
          )}
        </nav>

        <div className="plp-band">
          <span className="plp-band__icon" style={{ background: gradientFor(params.slug) }}>
            {iconFor(params.slug)}
          </span>
          <div className="plp-band__text">
            <h1>{title}</h1>
            <p>Fresh essentials for your everyday needs</p>
          </div>
          <div className="plp-band__badges">
            <span>🌿 Fresh Products</span>
            <span>✅ Best Quality</span>
            <span>💰 Great Prices</span>
          </div>
        </div>

        {nav.chips.length > 0 && (
          <div className="plp-subcats" data-testid="subcategories">
            {nav.chips.map((ch) => (
              <Link
                key={ch.id}
                href={`/category/${ch.slug}`}
                className={`plp-subcat${ch.slug === params.slug ? ' plp-subcat--active' : ''}`}
                aria-current={ch.slug === params.slug ? 'page' : undefined}
              >
                <span className="plp-subcat__ic">
                  {isUsableImageUrl(ch.imageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ch.imageUrl!} alt="" />
                  ) : (
                    iconFor(ch.slug)
                  )}
                </span>
                <span className="plp-subcat__name">{ch.name}</span>
              </Link>
            ))}
          </div>
        )}

        <div className="plp-heading">
          <span className="plp-count">
            Showing {data.items.length} of {data.total} products
          </span>
        </div>

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

        {data.items.length === 0 ? (
          <div className="plp-empty" data-testid="category-empty">
            <p>No products match these filters.</p>
            {nav.parent && (
              <p className="plp-empty__hint">
                <Link href={`/category/${nav.parent.slug}`}>See all of {nav.parent.name}</Link>
              </p>
            )}
          </div>
        ) : (
          <div className="product-grid" data-testid="product-grid">
            {data.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
