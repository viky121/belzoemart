import { useQuery } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import type { CmsPage, CmsPageSummary } from '@/api/types';

import { fetchCmsPage, fetchCmsPages } from './api';

export function useCmsPages() {
  return useQuery<CmsPageSummary[]>({
    queryKey: qk.cmsPages,
    queryFn: fetchCmsPages,
    staleTime: STALE.settings,
  });
}

export function useCmsPage(slug: string) {
  return useQuery<CmsPage>({
    queryKey: qk.cmsPage(slug),
    queryFn: () => fetchCmsPage(slug),
    staleTime: STALE.settings,
  });
}
