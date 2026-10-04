'use client';

import { apiFetch, type ApiRequestOptions } from './api-client';
import { safeUuid } from './uuid';

/**
 * Client-side cart API. Uses a guest token (persisted in localStorage) so
 * anonymous users get a cart; when logged in, the caller passes the access
 * token and the API resolves the customer instead.
 */
const GUEST_KEY = 'belzo_guest_token';

export function getGuestToken(): string {
  if (typeof window === 'undefined') return '';
  let token = window.localStorage.getItem(GUEST_KEY);
  if (!token) {
    token = safeUuid();
    window.localStorage.setItem(GUEST_KEY, token);
  }
  return token;
}

export interface CartLine {
  id: string;
  variantId: string;
  productId: string;
  quantity: number;
  savedForLater: boolean;
  title: string;
  sku: string;
  unit: string | null;
  imageUrl: string | null;
  unitPrice: number;
  basePrice: number;
  mrp: number;
  discountPct: number;
  taxRatePct: number;
  inStock: boolean;
  available: number;
  /** Bulk pricing tiers for this variant (minQty ascending). */
  priceSlabs: { minQty: number; unitPrice: number }[];
  /** Total units of this product across the cart (drives the tier). */
  tierQty: number;
}

export interface CartView {
  cartId: string;
  items: CartLine[];
}

function cartOptions(accessToken?: string, extra: ApiRequestOptions = {}): ApiRequestOptions {
  return {
    ...extra,
    accessToken,
    headers: { ...(extra.headers ?? {}), 'x-guest-token': getGuestToken() },
  };
}

/** Total units in the cart (excludes saved-for-later). */
export function cartCount(view: CartView): number {
  return view.items.filter((i) => !i.savedForLater).reduce((s, i) => s + i.quantity, 0);
}

/** Broadcast the latest cart count so the header badge updates everywhere. */
function emitCart(view: CartView): CartView {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('belzo:cart', { detail: { count: cartCount(view) } }));
  }
  return view;
}

/** Fire a transient toast message. */
export function toast(message: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('belzo:toast', { detail: { message } }));
  }
}

export const cartApi = {
  get: (accessToken?: string) => apiFetch<CartView>('/cart', cartOptions(accessToken)).then(emitCart),
  add: (variantId: string, quantity: number, accessToken?: string) =>
    apiFetch<CartView>('/cart/items', cartOptions(accessToken, { method: 'POST', body: { variantId, quantity } })).then(
      (v) => {
        toast('Added to cart');
        return emitCart(v);
      },
    ),
  update: (variantId: string, quantity: number, accessToken?: string) =>
    apiFetch<CartView>(`/cart/items/${variantId}`, cartOptions(accessToken, { method: 'PUT', body: { variantId, quantity } })).then(
      emitCart,
    ),
  remove: (variantId: string, accessToken?: string) =>
    apiFetch<CartView>(`/cart/items/${variantId}`, cartOptions(accessToken, { method: 'DELETE' })).then(emitCart),
  /**
   * Merge the guest cart into the signed-in customer's cart (BR-2) so items
   * added before logging in are not lost. Requires the access token; sends the
   * guest token in the body (the server deletes the guest cart after merging).
   */
  merge: (accessToken: string) =>
    apiFetch<CartView>(
      '/cart/merge',
      cartOptions(accessToken, { method: 'POST', body: { guestToken: getGuestToken() } }),
    ).then(emitCart),
};
