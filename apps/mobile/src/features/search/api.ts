import type { ProductCardDto, ProductSort } from '@belzo/shared';

import { apiRequest } from '@/api/client';
import type { Paginated } from '@/api/types';

export function fetchAutocomplete(q: string): Promise<string[]> {
  return apiRequest<string[]>('/search/autocomplete', { query: { q } });
}

/**
 * Tells the shop that the customer made a real search (Enter, a tapped suggestion or recent search),
 * so the admin "Search terms" report can count it. Fire and forget: never throws, never shown to the customer.
 */
export function logSearch(q: string): void {
  const term = q.trim();
  if (term.length < 2) return;
  void apiRequest<void>('/search/log', {
    method: 'POST',
    body: { q: term, source: 'app' },
    auth: 'optional',
    retry429: false,
  }).catch(() => undefined);
}

export function fetchSearch(params: {
  q: string;
  page: number;
  pageSize: number;
  sort: ProductSort;
}): Promise<Paginated<ProductCardDto>> {
  return apiRequest<Paginated<ProductCardDto>>('/search', { query: { ...params } });
}
