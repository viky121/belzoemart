import {
  pincodeSchema,
  sanitizeMobileHome,
  type HomeSection,
  type MobileHome,
  type ProductCardDto,
} from '@belzo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

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

/** Checks a PIN before adopting it as the delivery PIN (design §11 Home PIN chip). */
export function useServiceabilityCheck() {
  return useMutation<ServiceabilityResult, unknown, string>({
    mutationFn: (pincode) => fetchServiceability(pincode),
  });
}

/** True when we deliver to the PIN: it's on the serviceable list, or no list is configured. */
export function isDeliverable(r: ServiceabilityResult): boolean {
  return !r.configured || r.serviceable;
}

export type PinStatus = 'invalid' | 'checking' | 'deliverable' | 'blocked' | 'error';

/**
 * Serviceability of a PIN as a single status. Only `deliverable` may be saved as
 * the delivery PIN; `error` (network) is not treated as deliverable.
 */
export function usePinStatus(pin: string | null) {
  const valid = pin !== null && pincodeSchema.safeParse(pin).success;
  const query = useQuery<ServiceabilityResult>({
    queryKey: qk.serviceability(pin ?? ''),
    queryFn: () => fetchServiceability(pin as string),
    enabled: valid,
    staleTime: STALE.settings,
    retry: 1,
  });
  let status: PinStatus = 'invalid';
  if (valid) {
    if (query.isSuccess) status = isDeliverable(query.data) ? 'deliverable' : 'blocked';
    else if (query.isError) status = 'error';
    else status = 'checking';
  }
  return { status, configured: query.data?.configured ?? true, refetch: query.refetch };
}
