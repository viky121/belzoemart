import type { OrderDetail, ReturnPayload } from '@belzo/shared';

import { apiRequest } from '@/api/client';
import type { CartView } from '@/api/types';

export interface OrderSummaryItem {
  title: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  imageUrl: string | null;
  slug: string | null;
}

export interface OrderSummary {
  id: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  itemCount: number;
  imageUrl: string | null;
  items: OrderSummaryItem[];
}

export function fetchOrders(): Promise<OrderSummary[]> {
  return apiRequest<OrderSummary[]>('/orders', { auth: 'required' });
}

export function fetchOrderDetail(id: string): Promise<OrderDetail> {
  return apiRequest<OrderDetail>(`/orders/${id}`, { auth: 'required' });
}

export function cancelOrderRequest(id: string, reason: string): Promise<unknown> {
  return apiRequest(`/orders/${id}/cancel`, { method: 'POST', auth: 'required', body: { reason } });
}

export function submitReturn(payload: ReturnPayload): Promise<unknown> {
  return apiRequest('/orders/returns', { method: 'POST', auth: 'required', body: payload });
}

export function reorder(id: string): Promise<CartView> {
  return apiRequest<CartView>(`/orders/${id}/reorder`, { method: 'POST', auth: 'required' });
}

export function fetchInvoice(id: string): Promise<{ url: string; number: string }> {
  return apiRequest<{ url: string; number: string }>(`/orders/${id}/invoice`, { auth: 'required' });
}
