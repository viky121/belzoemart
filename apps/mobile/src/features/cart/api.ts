import { apiRequest } from '@/api/client';
import type { CartView } from '@/api/types';

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
