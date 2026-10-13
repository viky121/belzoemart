import type { ProductCardDto, ProductDetailDto } from '@belzo/shared';

import { apiRequest } from '@/api/client';
import type { Brand, Paginated, ProductParams, Review } from '@/api/types';

export function fetchProducts(params: ProductParams): Promise<Paginated<ProductCardDto>> {
  return apiRequest<Paginated<ProductCardDto>>('/products', { query: { ...params } });
}

export function fetchBrands(): Promise<Brand[]> {
  return apiRequest<Brand[]>('/brands');
}

export function fetchProduct(idOrSlug: string): Promise<ProductDetailDto> {
  return apiRequest<ProductDetailDto>(`/products/${encodeURIComponent(idOrSlug)}`);
}

export function fetchReviews(productId: string): Promise<Review[]> {
  return apiRequest<Review[]>(`/products/${productId}/reviews`);
}

/** Related products: same category, popularity sort; the current product is filtered out by the UI. */
export async function fetchRelated(categoryId: string): Promise<ProductCardDto[]> {
  const res = await apiRequest<Paginated<ProductCardDto>>('/products', {
    query: { categoryId, sort: 'popularity', pageSize: 12 },
  });
  return res.items;
}
