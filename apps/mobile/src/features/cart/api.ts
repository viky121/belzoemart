import { apiRequest } from '@/api/client';
import type { ActiveOfferView, CartView } from '@/api/types';

/** Cart endpoints share "cart identity": Bearer when signed in, else the guest token (design §4). */
export function fetchCart(): Promise<CartView> {
  return apiRequest<CartView>('/cart', { auth: 'optional', cart: true });
}

export function addToCart(variantId: string, quantity: number): Promise<CartView> {
  return apiRequest<CartView>('/cart/items', {
    method: 'POST',
    auth: 'optional',
    cart: true,
    body: { variantId, quantity },
  });
}

export function updateCartQuantity(variantId: string, quantity: number): Promise<CartView> {
  return apiRequest<CartView>(`/cart/items/${variantId}`, {
    method: 'PUT',
    auth: 'optional',
    cart: true,
    body: { variantId, quantity },
  });
}

export function removeCartLine(variantId: string): Promise<CartView> {
  return apiRequest<CartView>(`/cart/items/${variantId}`, {
    method: 'DELETE',
    auth: 'optional',
    cart: true,
  });
}

export function saveForLater(variantId: string): Promise<CartView> {
  return apiRequest<CartView>(`/cart/items/${variantId}/save-for-later`, {
    method: 'POST',
    auth: 'optional',
    cart: true,
  });
}

export function moveToCart(variantId: string): Promise<CartView> {
  return apiRequest<CartView>(`/cart/items/${variantId}/move-to-cart`, {
    method: 'POST',
    auth: 'optional',
    cart: true,
  });
}

/** The special-price offers that are on now (public); the product page shows them. */
export function fetchActiveOffers(): Promise<ActiveOfferView[]> {
  return apiRequest<ActiveOfferView[]>('/offers/active', { auth: 'none' });
}
export interface CouponResult {
  code: string;
  valid: boolean;
  reason?: string;
  discount: number;
}

/** Coupon validation is Bearer-only; callers send guests through requireAuth first (design §6.5). */
export function validateCoupon(code: string, subtotal: number): Promise<CouponResult> {
  return apiRequest<CouponResult>('/coupons/validate', {
    method: 'POST',
    auth: 'required',
    body: { code, subtotal },
  });
}
