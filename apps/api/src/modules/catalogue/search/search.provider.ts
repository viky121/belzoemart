import type { ProductCardDto, ProductQuery } from '@belzo/shared';

export interface SearchResult {
  items: ProductCardDto[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Search port (FR-2.3). Phase 1 uses PostgreSQL full-text search; a Typesense/
 * Elasticsearch adapter can replace it later without changing callers (A-3).
 */
export interface SearchProvider {
  search(query: ProductQuery): Promise<SearchResult>;
  autocomplete(term: string): Promise<string[]>;
  /** Optional re-index hook (no-op for the FTS adapter which queries live). */
  index(productId: string): Promise<void>;
}

export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');
