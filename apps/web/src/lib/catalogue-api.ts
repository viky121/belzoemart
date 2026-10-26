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
  /** All brands, or only the brands of one category (`categoryId`) or of a search (`q`). */
  brands: (filter: { categoryId?: string; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (filter.categoryId) qs.set('categoryId', filter.categoryId);
    if (filter.q) qs.set('q', filter.q);
    return apiFetch<BrandDto[]>(`/brands${qs.size ? `?${qs.toString()}` : ''}`, { revalidate: 300 });
  },
  products: (qs: string) =>
    apiFetch<Paginated<ProductCardDto>>(`/products${qs ? `?${qs}` : ''}`, { revalidate: 60 }),
  product: (idOrSlug: string) =>
    apiFetch<ProductDetailDto>(`/products/${encodeURIComponent(idOrSlug)}`, { revalidate: 60 }),
  search: (qs: string) => apiFetch<Paginated<ProductCardDto>>(`/search?${qs}`, { revalidate: 30 }),
};

/** Format integer paise as an INR string for display (pure, see format-inr.ts). */
export { formatInr } from './format-inr';
