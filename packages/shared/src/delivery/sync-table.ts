import { ORDER_PROGRESS_STEPS } from '../order-tracking';
import { ORDER_TRANSITIONS, type OrderStatus } from '../constants';
import type { DeliveryMove } from './status';

/**
 * How each delivery move shows up in the order, the shipment and the customer's tracking
 * timeline (BR-D50 to BR-D57). The text is fixed and customer-safe: a partner's note or
 * reason code is never copied into it.
 */

/** Values of the Prisma `ShipmentStatus` enum. */
export type ShipmentStatusValue =
  | 'created'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'rto';

export interface SyncRow {
  /** The order is moved forward to at least this status (never backwards). */
  orderStatus?: OrderStatus;
  /** The inhouse Shipment status. */
  shipmentStatus?: ShipmentStatusValue;
  /** Extra effect on the order that is not a plain forward move. */
  orderEffect?: 'cancel_undeliverable';
  /** Status stored on the TrackingEvent (a key of the shared tracking maps). */
  trackingStatus: string;
  /** Text stored on the TrackingEvent. */
  trackingText: string;
}

export const SYNC_TABLE: Readonly<Record<DeliveryMove, SyncRow>> = {
  assigned: {
    orderStatus: 'packed',
    shipmentStatus: 'packed',
    trackingStatus: 'assigned',
    trackingText: 'Assigned to a delivery partner',
  },
  reassigned: { trackingStatus: 'assigned', trackingText: 'Reassigned to another delivery partner' },
  accepted: { trackingStatus: 'accepted', trackingText: 'Delivery partner accepted your order' },
  rejected: { trackingStatus: 'packed', trackingText: 'Waiting for a delivery partner' },
  expired: { trackingStatus: 'packed', trackingText: 'Waiting for a delivery partner' },
  unassigned: { trackingStatus: 'packed', trackingText: 'Waiting for a delivery partner' },
  picked_up: {
    orderStatus: 'shipped',
    shipmentStatus: 'shipped',
    trackingStatus: 'picked_up',
    trackingText: 'Picked up by the delivery partner',
  },
  out_for_delivery: {
    orderStatus: 'out_for_delivery',
    shipmentStatus: 'out_for_delivery',
    trackingStatus: 'out_for_delivery',
    trackingText: 'Out for delivery',
  },
  retry: {
    orderStatus: 'out_for_delivery',
    shipmentStatus: 'out_for_delivery',
    trackingStatus: 'out_for_delivery',
    trackingText: 'Out for delivery again',
  },
  arrived: { trackingStatus: 'arrived', trackingText: 'The delivery partner has arrived' },
  failed_attempt: {
    trackingStatus: 'failed_attempt',
    trackingText: 'Delivery attempt unsuccessful. We will try again',
  },
  force_failed: {
    trackingStatus: 'failed_attempt',
    trackingText: 'Delivery attempt unsuccessful. We will try again',
  },
  delivered: {
    orderStatus: 'delivered',
    shipmentStatus: 'delivered',
    trackingStatus: 'delivered',
    trackingText: 'Delivered',
  },
  returned: {
    orderEffect: 'cancel_undeliverable',
    shipmentStatus: 'rto',
    trackingStatus: 'rto',
    trackingText: 'Could not be delivered and returned to the seller',
  },
  cancelled: { shipmentStatus: 'cancelled', trackingStatus: 'cancelled', trackingText: 'Delivery cancelled' },
};

/** Order status a move implies, or null when the move leaves the order alone. */
export function toOrderStatus(move: DeliveryMove): OrderStatus | null {
  return SYNC_TABLE[move].orderStatus ?? null;
}

export function toTrackingStatus(move: DeliveryMove): { status: string; text: string } {
  const row = SYNC_TABLE[move];
  return { status: row.trackingStatus, text: row.trackingText };
}

/** Reason stored on an order cancelled because the delivery failed for good (FD2 = A). */
export const UNDELIVERABLE_CANCEL_REASON = 'Undeliverable, returned to shop';

function rank(s: OrderStatus): number {
  return ORDER_PROGRESS_STEPS.indexOf(s);
}

/**
 * The order statuses to step through to bring `current` forward to `target`, one legal
 * transition at a time (BR-D50). Returns [] when nothing needs to change: the order is
 * already at or beyond the target, is terminal (cancelled or returned), is still pending
 * or unconfirmed (delivery never confirms an order), or no legal path exists.
 */
export function orderWalk(current: OrderStatus, target: OrderStatus): OrderStatus[] {
  const from = rank(current);
  const to = rank(target);
  if (from < 0 || to < 0 || from >= to) return [];
  if (current === 'pending') return [];
  const steps: OrderStatus[] = [];
  let at: OrderStatus = current;
  while (rank(at) < to) {
    const next: OrderStatus | undefined = ORDER_PROGRESS_STEPS[rank(at) + 1];
    if (!next || !ORDER_TRANSITIONS[at].includes(next)) return [];
    steps.push(next);
    at = next;
  }
  return steps;
}

/** The status the order ends in after walking toward `target` (never lower than `current`). */
export function furthestOrderStatus(current: OrderStatus, target: OrderStatus): OrderStatus {
  const walk = orderWalk(current, target);
  return walk.length > 0 ? (walk[walk.length - 1] as OrderStatus) : current;
}
