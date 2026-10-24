import type { CategoryNodeDto } from '@belzo/shared';
import { useQuery } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';

import { fetchCategories } from './api';

/** Shared categories tree query (used by Home shortcuts and the Categories screen). */
export function useCategories() {
  return useQuery<CategoryNodeDto[]>({
    queryKey: qk.categories,
    queryFn: fetchCategories,
    staleTime: STALE.catalogue,
  });
}
