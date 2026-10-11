import type { OrderStatus } from './constants';

/**
 * Order tracking helpers shared by the API and the storefront. The order status
 * is the single source of truth: shipment/tracking statuses can only push the
 * displayed progress forward, never contradict a terminal order state, and a
 * timeline that lags the order is completed with clearly-marked derived steps.
 */

/** The forward (happy-path) progression shown to customers. */
export const ORDER_PROGRESS_STEPS: readonly OrderStatus[] = [
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
];

/** Customer-facing labels for every order status. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Order placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

/** Labels for courier/shipment statuses that are not order statuses. */
export const TRACKING_STATUS_LABELS: Record<string, string> = {
  created: 'Shipment created',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  rto: 'Returned to seller',
  refunded: 'Refunded',
};

/** Courier/shipment status → the order progress step it implies. */
export const TRACKING_PROGRESS_MAP: Record<string, OrderStatus> = {
  created: 'packed',
  packed: 'packed',
  picked_up: 'shipped',
  in_transit: 'shipped',
  shipped: 'shipped',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
};

/** Lowercase, trim, and turn spaces/hyphens into underscores. */
export function normalizeStatus(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Human label for an order or tracking status (humanized when unknown). */
export function statusLabel(s: string | null | undefined): string {
  const key = normalizeStatus(s);
  if (!key) return 'Unknown';
  const known = (ORDER_STATUS_LABELS as Record<string, string>)[key] ?? TRACKING_STATUS_LABELS[key];
  if (known) return known;
  const words = key.replace(/_+/g, ' ').trim();
  if (!words) return 'Unknown';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Position of a status in ORDER_PROGRESS_STEPS (order status or mapped
 * tracking status); -1 for terminal/unknown statuses.
 */
export function progressRank(s: string | null | undefined): number {
  const key = normalizeStatus(s);
  const direct = (ORDER_PROGRESS_STEPS as readonly string[]).indexOf(key);
  if (direct >= 0) return direct;
  const mapped = TRACKING_PROGRESS_MAP[key];
  return mapped ? ORDER_PROGRESS_STEPS.indexOf(mapped) : -1;
}

/** Cancelled/returned orders never move again. */
export function isTerminalOrderStatus(s: string | null | undefined): boolean {
  const key = normalizeStatus(s);
  return key === 'cancelled' || key === 'returned';
}

/**
 * The furthest progress status implied by the order status and any tracking
 * statuses. A terminal order status always wins.
 */
export function furthestStatus(
  orderStatus: OrderStatus,
  trackingStatuses: readonly (string | null | undefined)[],
): OrderStatus {
  if (isTerminalOrderStatus(orderStatus)) return orderStatus;
  let max = progressRank(orderStatus);
  for (const s of trackingStatuses) max = Math.max(max, progressRank(s));
  return max >= 0 ? (ORDER_PROGRESS_STEPS[max] ?? orderStatus) : orderStatus;
}

export type DateLike = Date | string | null | undefined;

export interface ReconcileEventInput {
  status: string;
  description?: string | null;
  location?: string | null;
  occurredAt: DateLike;
}

export interface ReconcileShipmentInput {
  id: string;
  awb?: string | null;
  courier?: string | null;
  status: string;
  trackingUrl?: string | null;
  estimatedDelivery?: DateLike;
  createdAt?: DateLike;
  events?: readonly ReconcileEventInput[] | null;
}

export interface ReconcileInput {
  order: { status: OrderStatus; createdAt?: DateLike; updatedAt?: DateLike };
  shipments: readonly ReconcileShipmentInput[];
}

export interface TimelineEvent {
  status: string;
  label: string;
  description: string;
  location: string | null;
  /** ISO timestamp, or null when the time is not known. */
  occurredAt: string | null;
  /** True when the step was inferred from the order status, not reported by the courier. */
  derived: boolean;
}

export interface ReconciledShipment {
  id: string;
  awb: string | null;
  courier: string | null;
  trackingUrl: string | null;
  estimatedDelivery: string | null;
  /** Raw status stored for the shipment. */
  providerStatus: string;
  /** Status reconciled with the order status. */
  status: string;
  statusLabel: string;
  /** Newest first. */
  events: TimelineEvent[];
}

export interface ReconciledTracking {
  orderStatus: OrderStatus;
  latestStatus: OrderStatus;
  latestLabel: string;
  shipments: ReconciledShipment[];
}

const SHIPPING_STEPS: readonly OrderStatus[] = ['packed', 'shipped', 'out_for_delivery', 'delivered'];
const DERIVED_DESCRIPTION = 'Updated from your order status';

function toTime(d: DateLike): number | null {
  if (d === null || d === undefined) return null;
  const t = d instanceof Date ? d.getTime() : Date.parse(d);
  return Number.isFinite(t) ? t : null;
}

function toIso(d: DateLike): string | null {
  const t = toTime(d);
  return t === null ? null : new Date(t).toISOString();
}

function reconcileShipment(order: ReconcileInput['order'], s: ReconcileShipmentInput): ReconciledShipment {
  // (a) Collapse duplicates (older syncs stored the same event repeatedly).
  const seen = new Set<string>();
  const real: { ev: TimelineEvent; time: number | null; rank: number; idx: number }[] = [];
  (s.events ?? []).forEach((e, idx) => {
    const status = normalizeStatus(e.status);
    const time = toTime(e.occurredAt);
    const key = `${status}|${time ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    const label = statusLabel(status);
    const location = e.location?.trim() || null;
    real.push({
      ev: {
        status,
        label,
        description: e.description?.trim() || label,
        location,
        occurredAt: time === null ? null : new Date(time).toISOString(),
        derived: false,
      },
      time,
      rank: progressRank(status),
      idx,
    });
  });

  // (b) Newest first; missing/invalid dates last; ties by progress then input order.
  real.sort((a, b) => {
    if (a.time === null && b.time === null) return b.rank - a.rank || a.idx - b.idx;
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return b.time - a.time || b.rank - a.rank || a.idx - b.idx;
  });

  // (c) Derive the steps the courier has not reported but the order status implies.
  let eventMaxRank = progressRank(s.status);
  let newestReal: number | null = null;
  for (const r of real) {
    eventMaxRank = Math.max(eventMaxRank, r.rank);
    if (r.time !== null && (newestReal === null || r.time > newestReal)) newestReal = r.time;
  }
  const derivationRank =
    order.status === 'returned'
      ? progressRank('delivered')
      : order.status === 'cancelled'
        ? -1
        : progressRank(order.status);
  const updatedAt = toTime(order.updatedAt);

  const derived: TimelineEvent[] = [];
  for (const step of SHIPPING_STEPS) {
    const rank = progressRank(step);
    if (!(eventMaxRank < rank && rank <= derivationRank)) continue;
    let occurredAt: string | null = null;
    if (step === 'packed') {
      occurredAt = toIso(s.createdAt);
    } else if (step === order.status && updatedAt !== null && (newestReal === null || updatedAt >= newestReal)) {
      occurredAt = new Date(updatedAt).toISOString();
    }
    derived.push({
      status: step,
      label: statusLabel(step),
      description: DERIVED_DESCRIPTION,
      location: null,
      occurredAt,
      derived: true,
    });
  }
  derived.reverse(); // furthest step on top

  // (d) Reconciled shipment status; the raw value is kept as providerStatus.
  const status = furthestStatus(order.status, [s.status, ...real.map((r) => r.ev.status)]);

  return {
    id: s.id,
    awb: s.awb ?? null,
    courier: s.courier ?? null,
    trackingUrl: s.trackingUrl ?? null,
    estimatedDelivery: toIso(s.estimatedDelivery),
    providerStatus: s.status,
    status,
    statusLabel: statusLabel(status),
    events: [...derived, ...real.map((r) => r.ev)],
  };
}

/**
 * Reconcile shipments + tracking events with the order status. Pure and
 * tolerant of missing dates; never throws on partial input.
 */
export function reconcileTracking(input: ReconcileInput): ReconciledTracking {
  const { order } = input;
  const shipments = (input.shipments ?? []).map((s) => reconcileShipment(order, s));
  const allStatuses: string[] = [];
  for (const s of input.shipments ?? []) {
    allStatuses.push(s.status);
    for (const e of s.events ?? []) allStatuses.push(e.status);
  }
  const latestStatus = furthestStatus(order.status, allStatuses);
  return {
    orderStatus: order.status,
    latestStatus,
    latestLabel: statusLabel(latestStatus),
    shipments,
  };
}
