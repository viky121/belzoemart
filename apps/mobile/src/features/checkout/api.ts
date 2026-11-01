import type { FulfilmentMethod, PaymentMethod, PickupInfo } from '@belzo/shared';

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
  fulfilment?: FulfilmentMethod;
}): Promise<CheckoutPreviewResult> {
  return apiRequest<CheckoutPreviewResult>('/checkout/preview', {
    method: 'POST',
    auth: 'required',
    body,
  });
}

export function placeOrder(
  idempotencyKey: string,
  body: {
    addressId: string;
    paymentMethod: PaymentMethod;
    couponCode?: string;
    fulfilment?: FulfilmentMethod;
    pickupSlotStart?: string;
  },
): Promise<PlaceOrderResult> {
  return apiRequest<PlaceOrderResult>('/checkout/place', {
    method: 'POST',
    auth: 'required',
    query: { idempotencyKey },
    body,
    timeoutMs: 30_000,
  });
}

/** Self pickup (public): is it on, the shop address and note, and the day/time slots on offer right now. */
export function fetchPickupInfo(): Promise<PickupInfo> {
  return apiRequest<PickupInfo>('/checkout/pickup', { auth: 'none' });
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
