import type { PaymentMethod } from '@belzo/shared';

import { apiRequest } from '@/api/client';
import type { CheckoutPreviewResult, PlaceOrderResult } from '@/api/types';

export interface ConfirmationOrder {
  id: string;
  status: string;
  grandTotal: number;
  payments: { provider: string; status: string }[];
}

export function previewCheckout(body: {
  addressId: string;
  couponCode?: string;
  paymentMethod: PaymentMethod;
}): Promise<CheckoutPreviewResult> {
  return apiRequest<CheckoutPreviewResult>('/checkout/preview', {
    method: 'POST',
    auth: 'required',
    body,
  });
}

export function placeOrder(
  idempotencyKey: string,
  body: { addressId: string; paymentMethod: PaymentMethod; couponCode?: string },
): Promise<PlaceOrderResult> {
  return apiRequest<PlaceOrderResult>('/checkout/place', {
    method: 'POST',
    auth: 'required',
    query: { idempotencyKey },
    body,
    timeoutMs: 30_000,
  });
}

/** Cancel used only by the online-payment-unavailable path (design §6.6). */
export function cancelOrder(orderId: string, reason: string): Promise<unknown> {
  return apiRequest(`/orders/${orderId}/cancel`, {
    method: 'POST',
    auth: 'required',
    body: { reason },
    retry429: false,
  });
}

export function fetchOrder(orderId: string): Promise<ConfirmationOrder> {
  return apiRequest<ConfirmationOrder>(`/orders/${orderId}`, { auth: 'required' });
}
