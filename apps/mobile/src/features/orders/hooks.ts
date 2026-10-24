import { isLiveStatus, type OrderDetail } from '@belzo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk, STALE } from '@/api/query-keys';
import { useCartIdentity } from '@/store/session';

import {
  cancelOrderRequest,
  fetchOrderDetail,
  fetchOrders,
  reorder,
  submitReturn,
  type OrderSummary,
} from './api';

export function useOrders() {
  return useQuery<OrderSummary[]>({
    queryKey: qk.orders,
    queryFn: fetchOrders,
    staleTime: STALE.default,
  });
}

/** Order detail with live polling while the order can still move (design §6.9). */
export function useOrderDetail(id: string) {
  return useQuery<OrderDetail>({
    queryKey: qk.order(id),
    queryFn: () => fetchOrderDetail(id),
    refetchInterval: (q) => (q.state.data && isLiveStatus(q.state.data.status) ? 30_000 : false),
  });
}

export function useCancelOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => cancelOrderRequest(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.order(id) });
      void queryClient.invalidateQueries({ queryKey: qk.orders });
    },
  });
}

export function useSubmitReturn(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitReturn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.order(id) }),
  });
}

export function useReorder() {
  const queryClient = useQueryClient();
  const identity = useCartIdentity();
  return useMutation({
    mutationFn: (id: string) => reorder(id),
    onSuccess: (cart) => queryClient.setQueryData(qk.cart(identity), cart),
  });
}
