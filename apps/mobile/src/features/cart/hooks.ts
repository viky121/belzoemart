import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import type { CartView } from '@/api/types';
import { useCartIdentity } from '@/store/session';
import { useToast } from '@/ui/Toast';

import { addToCart, fetchCart } from './api';

/** The current cart (identity-keyed). Owned here; the tab badge reads the same cache. */
export function useCart() {
  const identity = useCartIdentity();
  return useQuery<CartView>({
    queryKey: qk.cart(identity),
    queryFn: fetchCart,
    staleTime: STALE.cart,
  });
}

/** Add a variant to the cart; replaces the cart cache and toasts (design §6.5). */
export function useAddToCart() {
  const queryClient = useQueryClient();
  const identity = useCartIdentity();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ variantId, quantity = 1 }: { variantId: string; quantity?: number }) =>
      addToCart(variantId, quantity),
    onSuccess: (view) => {
      queryClient.setQueryData(qk.cart(identity), view);
      toast.show({ message: 'Added to cart', tone: 'success' });
    },
    onError: () => toast.show({ message: 'Could not add to cart. Please try again.', tone: 'error' }),
  });
}
