import type { ProductCardDto, ProductDetailDto } from '@belzo/shared';

import { apiRequest } from '@/api/client';
import type { Brand, Paginated, ProductParams, Review } from '@/api/types';

export function fetchProducts(params: ProductParams): Promise<Paginated<ProductCardDto>> {
  return apiRequest<Paginated<ProductCardDto>>('/products', { query: { ...params } });
}

/** All brands, or only the brands that sell in one category (and the ones below it). */
export function fetchBrands(categoryId?: string): Promise<Brand[]> {
  return apiRequest<Brand[]>('/brands', { query: { categoryId } });
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
