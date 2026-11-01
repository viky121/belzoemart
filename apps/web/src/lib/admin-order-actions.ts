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

/** Home delivery: the next status the admin button moves an order to. */
export const NEXT_STATUS: Record<string, string> = {
  confirmed: 'packed',
  packed: 'shipped',
  shipped: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

/** Self pickup: nothing is shipped, so Packed ("Ready for pickup") is followed by Delivered ("Picked up"). */
const NEXT_STATUS_PICKUP: Record<string, { next: string; label: string }> = {
  confirmed: { next: 'packed', label: 'Ready for pickup' },
  packed: { next: 'delivered', label: 'Picked up' },
};

export interface StatusStep {
  /** The status the order moves to. */
  next: string;
  /** The button text. */
  label: string;
}

/** The one button that moves an order forward, or null when there is none. */
export function nextStep(status: string, fulfilment?: string | null): StatusStep | null {
  if (fulfilment === 'pickup') return NEXT_STATUS_PICKUP[status] ?? null;
  const next = NEXT_STATUS[status];
  return next ? { next, label: `→ ${next.replace(/_/g, ' ')}` } : null;
}

/** "Create shipment" is for home delivery only. A pickup order has nothing to ship. */
export function canCreateShipment(status: string, fulfilment?: string | null): boolean {
  return status === 'confirmed' && fulfilment !== 'pickup';
}

/** Hint under the buttons of a pickup order that is waiting for the customer to come. */
export function pickupHint(status: string, fulfilment?: string | null, atShop = false): string | null {
  if (fulfilment !== 'pickup') return null;
  if (status === 'packed') return atShop ? 'Waiting for the customer. Press Picked up when they collect it and pay.' : 'Waiting for the customer. Press Picked up when they collect it.';
  if (status === 'confirmed') return 'Pack the order, then press Ready for pickup. The customer is told.';
  return null;
}
