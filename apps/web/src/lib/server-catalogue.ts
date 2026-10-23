import type { CategoryNodeDto } from '@belzo/shared';
import { catalogueApi } from './catalogue-api';
import { requestCache } from './request-cache';

/**
 * Server-only, request-memoized category tree read. `cache` dedupes the home
 * page's direct use and the home-section resolver (which needs category slugs)
 * so the tree is fetched once per render. Kept out of `catalogue-api.ts`
 * because that module is also imported by client components, where React
 * `cache` does not apply.
 */
export const getCategoriesCached = requestCache(
  (): Promise<CategoryNodeDto[]> => catalogueApi.categories().catch(() => [] as CategoryNodeDto[]),
);
