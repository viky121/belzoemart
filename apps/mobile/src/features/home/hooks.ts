import {
  sanitizeMobileHome,
  type HomeSection,
  type MobileHome,
  type ProductCardDto,
} from '@belzo/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { qk, STALE } from '@/api/query-keys';
import type { Banner, PublicSettings } from '@/api/types';

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

export function useRecentlyViewedProducts(ids: string[]) {
  return useQuery<ProductCardDto[]>({
    queryKey: qk.productsByIds(ids),
    queryFn: () => fetchProductsByIds(ids),
    enabled: ids.length > 0,
    staleTime: STALE.product,
  });
}
