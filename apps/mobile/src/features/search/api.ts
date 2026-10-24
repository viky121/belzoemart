import type { ProductCardDto, ProductSort } from '@belzo/shared';

import { apiRequest } from '@/api/client';
import type { Paginated } from '@/api/types';

export function fetchAutocomplete(q: string): Promise<string[]> {
  return apiRequest<string[]>('/search/autocomplete', { query: { q } });
}

export function fetchSearch(params: {
  q: string;
  page: number;
  pageSize: number;
  sort: ProductSort;
}): Promise<Paginated<ProductCardDto>> {
  return apiRequest<Paginated<ProductCardDto>>('/search', { query: { ...params } });
}
