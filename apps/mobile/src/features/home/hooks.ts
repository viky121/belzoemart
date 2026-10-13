import type { HomeSection, ProductCardDto } from '@belzo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import type { Banner, PublicSettings } from '@/api/types';

import {
  fetchHomeBanners,
  fetchProductsByIds,
  fetchSectionProducts,
  fetchServiceability,
  fetchSettings,
  type ServiceabilityResult,
} from './api';

export function useSettings() {
  return useQuery<PublicSettings>({
    queryKey: qk.settings,
    queryFn: fetchSettings,
    staleTime: STALE.settings,
  });
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

/** Checks a PIN before adopting it as the delivery PIN (design §11 Home PIN chip). */
export function useServiceabilityCheck() {
  return useMutation<ServiceabilityResult, unknown, string>({
    mutationFn: (pincode) => fetchServiceability(pincode),
  });
}
