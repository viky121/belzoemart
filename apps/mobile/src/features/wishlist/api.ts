import { apiRequest } from '@/api/client';
import type { WishlistItem } from '@/api/types';

export function fetchWishlist(): Promise<WishlistItem[]> {
  return apiRequest<WishlistItem[]>('/wishlist', { auth: 'required' });
}

export function addToWishlist(variantId: string): Promise<WishlistItem[]> {
  return apiRequest<WishlistItem[]>('/wishlist', {
    method: 'POST',
    auth: 'required',
    body: { variantId },
  });
}

export function removeFromWishlist(variantId: string): Promise<WishlistItem[]> {
  return apiRequest<WishlistItem[]>(`/wishlist/${variantId}`, {
    method: 'DELETE',
    auth: 'required',
  });
}
