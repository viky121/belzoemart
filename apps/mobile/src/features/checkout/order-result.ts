export type OrderResultView = 'confirmed' | 'cod' | 'awaiting' | 'failed' | 'notfound';

interface OrderResultInput {
  status: string;
  payments: { provider: string }[];
}

/**
 * Order confirmation view (design §6.8), identical to the web `resolveView`:
 * cancelled → failed; non-pending → confirmed; pending COD → cod; pending online → awaiting.
 */
export function resolveOrderResultView(
  order: OrderResultInput | null,
  provider: string,
): OrderResultView {
  if (!order) return 'notfound';
  if (order.status === 'cancelled') return 'failed';
  if (order.status !== 'pending') return 'confirmed';
  const pay = order.payments[0];
  if (provider === 'cod' || pay?.provider === 'cod') return 'cod';
  return 'awaiting';
}
