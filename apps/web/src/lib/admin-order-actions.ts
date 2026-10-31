/** What the admin can do with an order that has not been confirmed yet. */
export type PendingAction = 'confirm_cod' | 'waiting_payment' | null;

/**
 * A pending order is waiting for something. Cash on Delivery has nothing to wait for, so the admin may
 * confirm it by hand (normally it is confirmed the moment it is placed). An online order is waiting for
 * the customer's payment and is confirmed only by that payment.
 */
export function pendingAction(status: string, payments: readonly { provider: string }[]): PendingAction {
  if (status !== 'pending') return null;
  return payments.some((p) => p.provider === 'cod') ? 'confirm_cod' : 'waiting_payment';
}

export const WAITING_FOR_PAYMENT_HINT =
  'The customer has not paid yet. The order is confirmed automatically when the payment arrives; if it never does, it is cancelled after a while.';
