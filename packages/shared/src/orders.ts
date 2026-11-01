import { ORDER_TRANSITIONS, SYSTEM_CANCEL_FROM, type OrderStatus } from './constants';
import type { FulfilmentMethod } from './pickup';

/**
 * A self pickup order is never shipped: once it is packed ("Ready for pickup") the next step is delivered
 * ("Picked up"). Everything else is the same table as home delivery.
 */
const PICKUP_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  ...ORDER_TRANSITIONS,
  packed: ['delivered', 'cancelled'],
};

/**
 * Order state-machine helpers (BR-1). The transition table lives in
 * constants.ts (ORDER_TRANSITIONS) as the single source of truth.
 */

/** True iff `to` is a permitted next state from `from`. */
export function canTransition(from: OrderStatus, to: OrderStatus, fulfilment: FulfilmentMethod = 'delivery'): boolean {
  return (fulfilment === 'pickup' ? PICKUP_TRANSITIONS : ORDER_TRANSITIONS)[from]?.includes(to) ?? false;
}

/** The permitted next states from a status. */
export function nextStates(from: OrderStatus, fulfilment: FulfilmentMethod = 'delivery'): OrderStatus[] {
  return (fulfilment === 'pickup' ? PICKUP_TRANSITIONS : ORDER_TRANSITIONS)[from] ?? [];
}

/** Customer may cancel any time before the order has shipped (BR-2). */
export function canCustomerCancel(status: OrderStatus): boolean {
  return status === 'pending' || status === 'confirmed' || status === 'packed';
}

/** True iff the system may cancel an order in this status after a failed in-house delivery (BR-D56). */
export function canSystemCancel(status: OrderStatus): boolean {
  return canTransition(status, 'cancelled') || SYSTEM_CANCEL_FROM.includes(status);
}

/**
 * Format a sequential GST invoice number: BELZO/<year>/<zero-padded seq>.
 * (BR-4). `seq` is a positive integer.
 */
export function formatInvoiceNumber(year: number, seq: number): string {
  return `BELZO/${year}/${String(seq).padStart(5, '0')}`;
}

/** Clamp a refund amount so it never exceeds the captured amount (BR-10). */
export function clampRefund(requested: number, captured: number): number {
  return Math.max(0, Math.min(requested, captured));
}
