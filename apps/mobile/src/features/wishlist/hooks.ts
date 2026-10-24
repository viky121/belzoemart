import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import type { WishlistItem } from '@/api/types';
import { useSessionStore } from '@/store/session';
import { useToast } from '@/ui/Toast';

import { addToWishlist, fetchWishlist, removeFromWishlist } from './api';

/** The customer's wishlist. Only runs when signed in (Bearer-only endpoint). */
export function useWishlist() {
  const isCustomer = useSessionStore((s) => s.status === 'authenticated');
  return useQuery<WishlistItem[]>({
    queryKey: qk.wishlist,
    queryFn: fetchWishlist,
    enabled: isCustomer,
    staleTime: STALE.default,
  });
}

/** Add or remove a variant from the wishlist; the response replaces the cache. */
export function useToggleWishlist() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ variantId, wishlisted }: { variantId: string; wishlisted: boolean }) =>
      wishlisted ? removeFromWishlist(variantId) : addToWishlist(variantId),
    onSuccess: (list, { wishlisted }) => {
      queryClient.setQueryData(qk.wishlist, list);
      toast.show({ message: wishlisted ? 'Removed from wishlist' : 'Added to wishlist' });
    },
    onError: () => toast.show({ message: 'Could not update wishlist.', tone: 'error' }),
  });
}
