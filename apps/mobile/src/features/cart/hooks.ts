import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import type { ActiveOfferView, CartView } from '@/api/types';
import { useCartIdentity } from '@/store/session';
import { useToast } from '@/ui/Toast';

import {
  addToCart,
  fetchActiveOffers,
  fetchCart,
  moveToCart,
  removeCartLine,
  saveForLater,
  updateCartQuantity,
  validateCoupon,
} from './api';

/** The current cart (identity-keyed). Owned here; the tab badge reads the same cache. */
export function useCart() {
  const identity = useCartIdentity();
  return useQuery<CartView>({
    queryKey: qk.cart(identity),
    queryFn: fetchCart,
    staleTime: STALE.cart,
  });
}

/** Live special-price offers. A failure means "no offers": the page then shows normal prices. */
export function useActiveOffers() {
  return useQuery<ActiveOfferView[]>({
    queryKey: qk.activeOffers,
    queryFn: () => fetchActiveOffers().catch(() => []),
    staleTime: STALE.settings,
  });
}
/** Add a variant to the cart; replaces the cart cache and toasts (design §6.5). */
export function useAddToCart() {
  const queryClient = useQueryClient();
  const identity = useCartIdentity();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      variantId,
      quantity = 1,
    }: {
      variantId: string;
      quantity?: number;
      /** Skip the "Added to cart" toast (product cards show the stepper instead). */
      silent?: boolean;
    }) => addToCart(variantId, quantity),
    onSuccess: (view, vars) => {
      queryClient.setQueryData(qk.cart(identity), view);
      if (!vars.silent) toast.show({ message: 'Added to cart', tone: 'success' });
    },
    onError: () => toast.show({ message: 'Could not add to cart. Please try again.', tone: 'error' }),
  });
}

/**
 * Shared cart-line mutation: replaces the cart cache on success; on a 500/P2025
 * (the line changed server-side) it toasts and refetches (design §6.5).
 */
function useCartLineMutation<V>(fn: (v: V) => Promise<CartView>) {
  const queryClient = useQueryClient();
  const identity = useCartIdentity();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (view) => queryClient.setQueryData(qk.cart(identity), view),
    onError: () => {
      toast.show({ message: 'This item changed. Your cart has been refreshed.', tone: 'info' });
      void queryClient.invalidateQueries({ queryKey: qk.cart(identity) });
    },
  });
}

export function useUpdateQuantity() {
  return useCartLineMutation(({ variantId, quantity }: { variantId: string; quantity: number }) =>
    updateCartQuantity(variantId, quantity),
  );
}

export function useRemoveLine() {
  return useCartLineMutation((variantId: string) => removeCartLine(variantId));
}

export function useSaveForLater() {
  return useCartLineMutation((variantId: string) => saveForLater(variantId));
}

export function useMoveToCart() {
  return useCartLineMutation((variantId: string) => moveToCart(variantId));
}

export function useValidateCoupon() {
  return useMutation({
    mutationFn: ({ code, subtotal }: { code: string; subtotal: number }) =>
      validateCoupon(code, subtotal),
  });
}
