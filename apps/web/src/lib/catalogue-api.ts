import { apiFetch } from './api-client';
import type { CategoryNodeDto, ProductCardDto, ProductDetailDto } from '@belzo/shared';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BrandDto {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

/** Server-side catalogue reads for storefront pages (public, cacheable). */
export const catalogueApi = {
  categories: () => apiFetch<CategoryNodeDto[]>('/categories', { revalidate: 300 }),
  brands: () => apiFetch<BrandDto[]>('/brands', { revalidate: 300 }),
  products: (qs: string) =>
    apiFetch<Paginated<ProductCardDto>>(`/products${qs ? `?${qs}` : ''}`, { revalidate: 60 }),
  product: (idOrSlug: string) =>
    apiFetch<ProductDetailDto>(`/products/${encodeURIComponent(idOrSlug)}`, { revalidate: 60 }),
  search: (qs: string) => apiFetch<Paginated<ProductCardDto>>(`/search?${qs}`, { revalidate: 30 }),
};

/** Format integer paise as an INR string for display (pure, see format-inr.ts). */
export { formatInr } from './format-inr';
