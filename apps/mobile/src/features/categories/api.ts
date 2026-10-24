import type { CategoryNodeDto } from '@belzo/shared';

import { apiRequest } from '@/api/client';

/** The full 3-level category tree (design §4.1). */
export function fetchCategories(): Promise<CategoryNodeDto[]> {
  return apiRequest<CategoryNodeDto[]>('/categories');
}
