import { apiRequest } from '@/api/client';
import type { CmsPage, CmsPageSummary } from '@/api/types';

export function fetchCmsPages(): Promise<CmsPageSummary[]> {
  return apiRequest<CmsPageSummary[]>('/cms/pages');
}

export function fetchCmsPage(slug: string): Promise<CmsPage> {
  return apiRequest<CmsPage>(`/cms/pages/${encodeURIComponent(slug)}`);
}
