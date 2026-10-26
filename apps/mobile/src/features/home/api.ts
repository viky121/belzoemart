import type { HomeSection, ProductCardDto } from '@belzo/shared';

import { apiRequest } from '@/api/client';
import type { Banner, Paginated, PublicSettings } from '@/api/types';

export function fetchSettings(): Promise<PublicSettings> {
  return apiRequest<PublicSettings>('/settings/public');
}

export function fetchHomeBanners(): Promise<Banner[]> {
  return apiRequest<Banner[]>('/banners', { query: { placement: 'home_hero' } });
}


/** Products for one home-section rail; source drives the query (design §4.1). */
export async function fetchSectionProducts(section: HomeSection): Promise<ProductCardDto[]> {
  const query: Record<string, string | number | undefined> = { pageSize: section.limit };
  if (section.source.type === 'sort') query.sort = section.source.sort;
  else if (section.source.type === 'category') query.categoryId = section.source.categoryId;
  else query.ids = section.source.productIds.join(',');
  const res = await apiRequest<Paginated<ProductCardDto>>('/products', { query });
  return res.items;
}

/** Products by id, order preserved by the server (recently viewed rail). */
export async function fetchProductsByIds(ids: string[]): Promise<ProductCardDto[]> {
  if (ids.length === 0) return [];
  const res = await apiRequest<Paginated<ProductCardDto>>('/products', {
    query: { ids: ids.join(','), pageSize: ids.length },
  });
  return res.items;
}
