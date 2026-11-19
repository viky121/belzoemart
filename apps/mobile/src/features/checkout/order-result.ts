export type OrderResultView = 'confirmed' | 'cod' | 'awaiting' | 'failed' | 'notfound';

interface OrderResultInput {
  status: string;
  payments: { provider: string }[];
}

/**
 * Order confirmation view (design §6.8), identical to the web `resolveView`:
 * cancelled → failed; Cash on Delivery → cod (whether still pending or already confirmed: the server confirms a
 * COD order the moment it is placed, and no money has been paid yet); other non-pending → confirmed (paid);
 * pending online → awaiting.
 */
export function resolveOrderResultView(
  order: OrderResultInput | null,
  provider: string,
): OrderResultView {
  if (!order) return 'notfound';
  if (order.status === 'cancelled') return 'failed';
  const pay = order.payments[0];
  if (provider === 'cod' || pay?.provider === 'cod') return 'cod';
  if (order.status !== 'pending') return 'confirmed';
  return 'awaiting';
}
