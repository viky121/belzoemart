import type { ProductCardDto, ProductSort } from '@belzo/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import type { Paginated } from '@/api/types';

import { fetchSearch } from './api';

const SEARCH_PAGE_SIZE = 20;
/** Products shown in the suggestion list while typing (same count as the website's dropdown). */
const SUGGESTION_COUNT = 6;

/**
 * Product suggestions (picture, short name, price) while typing; only runs at >= 2 chars
 * (design §11 Search). Uses the normal search, so a suggestion is a real product the customer can open.
 */
export function useSuggestions(q: string) {
  return useQuery<ProductCardDto[]>({
    queryKey: qk.suggestions(q),
    queryFn: async () => {
      const page = await fetchSearch({ q, page: 1, pageSize: SUGGESTION_COUNT, sort: 'relevance' });
      return page.items;
    },
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
