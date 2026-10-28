import {
  sanitizeMobileHome,
  type HomeSection,
  type MobileHome,
  type ProductCardDto,
} from '@belzo/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { qk, STALE } from '@/api/query-keys';
import type { Banner, Paginated, PublicSettings } from '@/api/types';
import { fetchProducts } from '@/features/products/api';

import {
  fetchHomeBanners,
  fetchProductsByIds,
  fetchSectionProducts,
  fetchSettings,
} from './api';

export function useSettings() {
  return useQuery<PublicSettings>({
    queryKey: qk.settings,
    queryFn: fetchSettings,
    staleTime: STALE.settings,
  });
}

/**
 * Admin-managed mobile home config (banners, category icons/order, offer rows, deals).
 * Always complete: an old API, a failed request or an empty config yields defaults,
 * which leave the app looking exactly as it did before this module existed.
 */
export function useMobileHome(): MobileHome {
  const { data } = useSettings();
  return useMemo(() => sanitizeMobileHome(data?.mobileHome), [data?.mobileHome]);
}

export function useHomeBanners() {
  return useQuery<Banner[]>({
    queryKey: qk.banners,
    queryFn: fetchHomeBanners,
    staleTime: STALE.settings,
  });
}

/** One query per rail (design §11): keyed by the section id + source so edits refetch. */
export function useSectionRail(section: HomeSection) {
  return useQuery<ProductCardDto[]>({
    queryKey: ['home-rail', section.id, section.source],
    queryFn: () => fetchSectionProducts(section),
    staleTime: STALE.product,
  });
}

/** Products shown in a category block on the home page, and added by each tap on "See more". */
export const HOME_CATEGORY_PAGE = 6;

/** The products of one category, six at a time: the first six now, the next six on "See more". */
export function useCategoryBlock(categoryId: string) {
  return useInfiniteQuery({
    queryKey: ['home-category', categoryId],
    queryFn: ({ pageParam }) => fetchProducts({ categoryId, page: pageParam, pageSize: HOME_CATEGORY_PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<ProductCardDto>) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    staleTime: STALE.product,
  });
}

export function useRecentlyViewedProducts(ids: string[]) {
  return useQuery<ProductCardDto[]>({
    queryKey: qk.productsByIds(ids),
    queryFn: () => fetchProductsByIds(ids),
    enabled: ids.length > 0,
    staleTime: STALE.product,
  });
}
