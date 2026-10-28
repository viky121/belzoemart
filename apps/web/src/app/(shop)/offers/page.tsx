import type { ProductCardDto } from '@belzo/shared';
import { InfiniteProducts } from '@/components/infinite-products';
import { catalogueApi, type Paginated } from '@/lib/catalogue-api';
import { topDiscount } from '@/lib/phone-pages';

export const dynamic = 'force-dynamic';

const EMPTY: Paginated<ProductCardDto> = { items: [], total: 0, page: 1, pageSize: 20 };
const QUERY = 'sort=discount';

/** Offers tab: products with the biggest discount first. Only products priced below their MRP are shown. */
export default async function OffersPage() {
  const data = await catalogueApi.products(QUERY).catch(() => EMPTY);
  const top = topDiscount(data.items);
  const any = data.items.some((p) => p.discountPct > 0);
  return (
    <div className="offpg" data-testid="offers-page">
      <div className="offpg__head">
        <h1>Offers</h1>
        <p>Best deals on your everyday essentials</p>
        {top > 0 && <span className="offpg__chip">🏷️ Up to {top}% OFF</span>}
      </div>
      {any ? (
        <InfiniteProducts initial={data} endpoint="products" query={QUERY} testId="offers-grid" discountedOnly />
      ) : (
        <p className="offpg__empty" data-testid="offers-empty">
          No offers right now. Please check back soon.
        </p>
      )}
    </div>
  );
}
