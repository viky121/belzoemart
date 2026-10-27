'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductCardDto } from '@belzo/shared';
import { ProductCard } from '@/components/product-card';
import { catalogueApi, type Paginated } from '@/lib/catalogue-api';
import { hasMoreProducts, mergeProducts, pageQuery } from '@/lib/infinite-products';

/**
 * The product grid of a category or search page. The server draws the first page; as the customer scrolls
 * near the end, the next page is loaded and added below, until every product is on screen. A "Load more"
 * button stays as a fallback (and for a failed load). The parent gives this component a `key` made from the
 * filters and sort, so choosing another filter starts again from the first page.
 */
export function InfiniteProducts({
  initial,
  endpoint,
  query,
  testId,
}: {
  initial: Paginated<ProductCardDto>;
  endpoint: 'products' | 'search';
  /** Filters and sort of the listing, without `page`. */
  query: string;
  testId: string;
}) {
  const [items, setItems] = useState<ProductCardDto[]>(initial.items);
  const [page, setPage] = useState(initial.page);
  const [more, setMore] = useState(hasMoreProducts(initial.items.length, initial.total, initial.items.length));
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const itemsRef = useRef(items);
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const qs = pageQuery(query, page + 1);
      const res = endpoint === 'search' ? await catalogueApi.search(qs) : await catalogueApi.products(qs);
      const merged = mergeProducts(itemsRef.current, res.items);
      itemsRef.current = merged;
      setItems(merged);
      setMore(hasMoreProducts(merged.length, res.total, res.items.length));
      setPage(res.page);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [endpoint, page, query]);

  // Load the next page when the end of the grid comes near the screen.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || failed || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [more, failed, loadMore, items.length]);

  return (
    <>
      <div className="product-grid" data-testid={testId}>
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {more && (
        <div className="plp-more" ref={sentinel} data-testid="plp-more">
          {failed && <p className="plp-more__err">Could not load more products.</p>}
          <button type="button" className="plp-more__btn" onClick={() => void loadMore()} disabled={loading}>
            {loading ? 'Loading…' : failed ? 'Try again' : 'Load more products'}
          </button>
        </div>
      )}
      {!more && items.length > initial.items.length && (
        <p className="plp-end" data-testid="plp-end">
          You have seen all {items.length} products.
        </p>
      )}
    </>
  );
}
