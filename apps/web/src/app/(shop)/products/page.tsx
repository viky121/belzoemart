import Link from 'next/link';
import { parseProductsLink, PRODUCTS_LINK_MAX, type ProductCardDto } from '@belzo/shared';
import { catalogueApi, type Paginated } from '@/lib/catalogue-api';
import { ProductCard } from '@/components/product-card';

export const dynamic = 'force-dynamic';

const EMPTY: Paginated<ProductCardDto> = { items: [], total: 0, page: 1, pageSize: PRODUCTS_LINK_MAX };

interface SearchParams {
  ids?: string;
  title?: string;
}

/** A banner's "selected products" page: the hand-picked products, in the order the admin chose. */
export default async function SelectedProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const link = parseProductsLink(`/products?ids=${encodeURIComponent(searchParams.ids ?? '')}`);
  const title = (searchParams.title ?? '').trim().slice(0, 60) || 'Selected products';
  const qs = new URLSearchParams({ ids: link?.ids.join(',') ?? '', pageSize: String(PRODUCTS_LINK_MAX) });
  const data = link ? await catalogueApi.products(qs.toString()).catch(() => EMPTY) : EMPTY;

  return (
    // No filter sidebar here, so skip the two-column `.plp` grid.
    <div style={{ padding: '12px 0 40px' }}>
      <main className="plp-main">
        <nav className="plp-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>›</span>
          <span className="plp-breadcrumb__current">{title}</span>
        </nav>
        <div className="plp-heading">
          <h1>{title}</h1>
          {data.items.length > 0 && <span className="plp-count">({data.items.length} products)</span>}
        </div>
        {data.items.length === 0 ? (
          <div className="plp-empty" data-testid="selected-products-empty">
            <p>These products are not available right now.</p>
            <p className="plp-empty__hint">
              <Link href="/search">Browse all products</Link>
            </p>
          </div>
        ) : (
          <div className="product-grid" data-testid="selected-products">
            {data.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
