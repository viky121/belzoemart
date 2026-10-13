import type { ProductCardDto, ProductSort } from '@belzo/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import type { Paginated } from '@/api/types';

import { fetchAutocomplete, fetchSearch } from './api';

const SEARCH_PAGE_SIZE = 20;

/** Autocomplete suggestions; only runs at >= 2 chars (design §11 Search). */
export function useAutocomplete(q: string) {
  return useQuery<string[]>({
    queryKey: qk.autocomplete(q),
    queryFn: () => fetchAutocomplete(q),
    enabled: q.length >= 2,
    staleTime: STALE.product,
  });
}

/** Infinite search results; only runs with a non-empty query. */
export function useSearchResults(q: string, sort: ProductSort) {
  return useInfiniteQuery({
    queryKey: qk.search({ q, sort, pageSize: SEARCH_PAGE_SIZE }),
    queryFn: ({ pageParam }) =>
      fetchSearch({ q, sort, page: pageParam, pageSize: SEARCH_PAGE_SIZE }),
    enabled: q.length > 0,
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<ProductCardDto>) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    staleTime: STALE.product,
  });
}
