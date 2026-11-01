import { useQuery } from '@tanstack/react-query';

import { qk } from '@/api/query-keys';
import type { FulfilmentMethod, PickupInfo } from '@belzo/shared';
import type { CheckoutPreviewResult } from '@/api/types';

import type { CheckoutMethod } from './checkout-selection';
import { fetchPickupInfo, previewCheckout } from './api';

/** Checkout preview (design §11); re-runs when address, coupon or payment method change. */
export function usePreview(
  addressId: string | null,
  couponCode: string | null | undefined,
  method: CheckoutMethod | null,
  fulfilment: FulfilmentMethod = 'delivery',
) {
  return useQuery<CheckoutPreviewResult>({
    queryKey: qk.preview(addressId ?? '', couponCode, method ?? '', fulfilment),
    queryFn: () =>
      previewCheckout({
        addressId: addressId as string,
        couponCode: couponCode ?? undefined,
        paymentMethod: method as CheckoutMethod,
        fulfilment,
      }),
    enabled: Boolean(addressId && method),
    staleTime: 0,
  });
}

/**
 * Self pickup information (shop address, note and the slots on offer now). The slots depend on the time, so it
 * is fetched fresh every time the checkout opens. A failure just means "no pickup choice": home delivery stays.
 */
export function usePickupInfo(opts: { enabled?: boolean } = {}) {
  return useQuery<PickupInfo>({
    queryKey: qk.pickup,
    queryFn: fetchPickupInfo,
    enabled: opts.enabled ?? true,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });
}
