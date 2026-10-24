import { ORDER_TRANSITIONS, SYSTEM_CANCEL_FROM, type OrderStatus } from './constants';

/**
 * Order state-machine helpers (BR-1). The transition table lives in
 * constants.ts (ORDER_TRANSITIONS) as the single source of truth.
 */

/** True iff `to` is a permitted next state from `from`. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** The permitted next states from a status. */
export function nextStates(from: OrderStatus): OrderStatus[] {
  return ORDER_TRANSITIONS[from] ?? [];
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
