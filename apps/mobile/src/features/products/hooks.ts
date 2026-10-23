import type { ProductCardDto, ProductDetailDto, ProductSort } from '@belzo/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import type { Brand, Paginated, Review } from '@/api/types';

import { fetchBrands, fetchProduct, fetchProducts, fetchRelated, fetchReviews } from './api';

export const PRODUCT_PAGE_SIZE = 20;

export interface ProductListParams {
  categoryId?: string;
  brandId?: string;
  /** Comma-separated product ids (hand-picked list). */
  ids?: string;
  sort?: ProductSort;
}

/** Infinite product list (design §11 ProductList): 20 per page, next while page*size < total. */
export function useProducts(params: ProductListParams) {
  return useInfiniteQuery({
    queryKey: qk.products({ ...params, pageSize: PRODUCT_PAGE_SIZE }),
    queryFn: ({ pageParam }) =>
      fetchProducts({ ...params, page: pageParam, pageSize: PRODUCT_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<ProductCardDto>) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    staleTime: STALE.product,
  });
}

export function useBrands() {
  return useQuery<Brand[]>({ queryKey: qk.brands, queryFn: fetchBrands, staleTime: STALE.catalogue });
}

export function useProduct(idOrSlug: string) {
  return useQuery<ProductDetailDto>({
    queryKey: qk.product(idOrSlug),
    queryFn: () => fetchProduct(idOrSlug),
    staleTime: STALE.product,
  });
}

export function useReviews(productId: string | undefined) {
  return useQuery<Review[]>({
    queryKey: qk.reviews(productId ?? ''),
    queryFn: () => fetchReviews(productId as string),
    enabled: Boolean(productId),
    staleTime: STALE.product,
  });
}

export function useRelated(categoryId: string | undefined) {
  return useQuery<ProductCardDto[]>({
    queryKey: qk.related(categoryId ?? ''),
    queryFn: () => fetchRelated(categoryId as string),
    enabled: Boolean(categoryId),
    staleTime: STALE.product,
  });
}
