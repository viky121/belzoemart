import { useQuery } from '@tanstack/react-query';

import { qk } from '@/api/query-keys';
import type { CheckoutPreviewResult } from '@/api/types';

import type { CheckoutMethod } from './checkout-selection';
import { previewCheckout } from './api';

/** Checkout preview (design §11); re-runs when address, coupon or payment method change. */
export function usePreview(
  addressId: string | null,
  couponCode: string | null | undefined,
  method: CheckoutMethod | null,
) {
  return useQuery<CheckoutPreviewResult>({
    queryKey: qk.preview(addressId ?? '', couponCode, method ?? ''),
    queryFn: () =>
      previewCheckout({
        addressId: addressId as string,
        couponCode: couponCode ?? undefined,
        paymentMethod: method as CheckoutMethod,
      }),
    enabled: Boolean(addressId && method),
    staleTime: 0,
  });
}
