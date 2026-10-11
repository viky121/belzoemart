/**
 * Wallet credit for a received return on a delivered Cash-on-Delivery order
 * (all amounts integer paise). The returned items get their share of the goods
 * value actually charged (grandTotal minus shipping and COD fee, so coupon
 * discounts and GST are spread by line value). Shipping and the COD fee are
 * credited only once the whole order has been refunded. The result never
 * exceeds grandTotal minus what was already credited for the order.
 */
export function codReturnCredit(input: {
  grandTotal: number;
  shipping: number;
  codFee: number;
  items: readonly { id: string; unitPrice: number; quantity: number }[];
  /** Lines of the return being processed. */
  returning: readonly { orderItemId: string; quantity: number }[];
  /** Lines of earlier returns of this order that were already refunded. */
  previouslyRefunded: readonly { orderItemId: string; quantity: number }[];
  /** Wallet credit already given for earlier returns of this order. */
  alreadyCredited: number;
}): number {
  const remaining = Math.max(0, input.grandTotal - Math.max(0, input.alreadyCredited));
  const orderValue = input.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  if (remaining === 0 || orderValue <= 0) return 0;

  const returnedQty = new Map<string, number>();
  for (const l of [...input.previouslyRefunded, ...input.returning]) {
    returnedQty.set(l.orderItemId, (returnedQty.get(l.orderItemId) ?? 0) + l.quantity);
  }
  if (input.items.every((i) => (returnedQty.get(i.id) ?? 0) >= i.quantity)) return remaining;

  let value = 0;
  for (const l of input.returning) {
    const item = input.items.find((i) => i.id === l.orderItemId);
    if (item) value += item.unitPrice * Math.min(Math.max(0, l.quantity), item.quantity);
  }
  const goods = Math.max(0, input.grandTotal - input.shipping - input.codFee);
  return Math.min(Math.round((goods * value) / orderValue), remaining);
}
