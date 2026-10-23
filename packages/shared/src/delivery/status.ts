/**
 * Delivery job status machine (BR-D20 to BR-D26). Pure and side-effect free so the API,
 * the web app and the tests all use the same rules. The table below is the single source
 * of truth: `canMove`, `nextMoves` and the property tests are all derived from it.
 */

export const DELIVERY_STATUSES = [
  'new',
  'assigned',
  'accepted',
  'picked_up',
  'out_for_delivery',
  'arrived',
  'delivered',
  'failed_attempt',
  'returned',
  'cancelled',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** A job that reached one of these never changes status again. */
export const DELIVERY_FINAL_STATUSES: readonly DeliveryStatus[] = ['delivered', 'returned', 'cancelled'];

/** Statuses in which a partner is working on the job (they count toward a partner's capacity). */
export const DELIVERY_ACTIVE_STATUSES: readonly DeliveryStatus[] = [
  'assigned',
  'accepted',
  'picked_up',
  'out_for_delivery',
  'arrived',
  'failed_attempt',
];

export const DELIVERY_ACTOR_KINDS = ['admin', 'partner', 'system'] as const;
export type DeliveryActorKind = (typeof DELIVERY_ACTOR_KINDS)[number];

/** The named moves of the machine. A move is a (from-set, to, who) edge. */
export const DELIVERY_MOVES = [
  'assigned',
  'reassigned',
  'accepted',
  'rejected',
  'expired',
  'unassigned',
  'picked_up',
  'out_for_delivery',
  'arrived',
  'failed_attempt',
  'force_failed',
  'delivered',
  'retry',
  'returned',
  'cancelled',
] as const;
export type DeliveryMove = (typeof DELIVERY_MOVES)[number];

export interface DeliveryEdge {
  from: readonly DeliveryStatus[];
  to: DeliveryStatus;
  actors: readonly DeliveryActorKind[];
}

/**
 * The 15 moves. Compared with the PHP module, `cancelled` also leaves `arrived`
 * (a job at the door can be cancelled).
 */
export const DELIVERY_EDGES: Readonly<Record<DeliveryMove, DeliveryEdge>> = {
  assigned: { from: ['new'], to: 'assigned', actors: ['admin', 'system'] },
  reassigned: {
    from: ['assigned', 'accepted', 'picked_up', 'out_for_delivery', 'failed_attempt'],
    to: 'assigned',
    actors: ['admin', 'system'],
  },
  accepted: { from: ['assigned'], to: 'accepted', actors: ['partner'] },
  rejected: { from: ['assigned'], to: 'new', actors: ['partner'] },
  expired: { from: ['assigned'], to: 'new', actors: ['system'] },
  unassigned: { from: ['accepted'], to: 'new', actors: ['admin'] },
  picked_up: { from: ['accepted'], to: 'picked_up', actors: ['partner'] },
  out_for_delivery: { from: ['picked_up'], to: 'out_for_delivery', actors: ['partner'] },
  arrived: { from: ['out_for_delivery'], to: 'arrived', actors: ['partner'] },
  failed_attempt: { from: ['out_for_delivery', 'arrived'], to: 'failed_attempt', actors: ['partner'] },
  force_failed: { from: ['arrived'], to: 'failed_attempt', actors: ['admin'] },
  delivered: { from: ['arrived'], to: 'delivered', actors: ['partner'] },
  retry: { from: ['failed_attempt'], to: 'out_for_delivery', actors: ['partner'] },
  returned: { from: ['failed_attempt'], to: 'returned', actors: ['admin'] },
  cancelled: {
    from: ['new', 'assigned', 'accepted', 'picked_up', 'out_for_delivery', 'arrived', 'failed_attempt'],
    to: 'cancelled',
    actors: ['admin', 'system'],
  },
};

export function isFinalDeliveryStatus(s: DeliveryStatus): boolean {
  return DELIVERY_FINAL_STATUSES.includes(s);
}

/** True iff `move` may be run by `actor` while the job is in `from`. */
export function canRunMove(move: DeliveryMove, from: DeliveryStatus, actor: DeliveryActorKind): boolean {
  const edge = DELIVERY_EDGES[move];
  return edge.actors.includes(actor) && edge.from.includes(from);
}

/** True iff at least one move lets `actor` take a job from `from` to `to`. */
export function canMove(from: DeliveryStatus, to: DeliveryStatus, actor: DeliveryActorKind): boolean {
  return DELIVERY_MOVES.some((m) => DELIVERY_EDGES[m].to === to && canRunMove(m, from, actor));
}

/** The moves `actor` may run from `from`. */
export function nextMoves(from: DeliveryStatus, actor: DeliveryActorKind): DeliveryMove[] {
  return DELIVERY_MOVES.filter((m) => canRunMove(m, from, actor));
}

/** The status a move ends in. */
export function moveTarget(move: DeliveryMove): DeliveryStatus {
  return DELIVERY_EDGES[move].to;
}

/** Why a partner gave up on a delivery attempt (BR-D25). */
export const FAIL_REASON_CODES = [
  'customer_unavailable',
  'wrong_address',
  'refused',
  'phone_unreachable',
  'reschedule_requested',
  'cash_unavailable',
  'other',
] as const;
export type FailReasonCode = (typeof FAIL_REASON_CODES)[number];

export const FAIL_REASON_LABELS: Record<FailReasonCode, string> = {
  customer_unavailable: 'Customer not available',
  wrong_address: 'Wrong or incomplete address',
  refused: 'Customer refused the parcel',
  phone_unreachable: 'Customer phone unreachable',
  reschedule_requested: 'Customer asked to reschedule',
  cash_unavailable: 'Customer could not pay cash',
  other: 'Other reason',
};

export interface MoveRequirements {
  /** A free-text reason of 3 to 255 characters is required. */
  reason: boolean;
  /** A reason code from FAIL_REASON_CODES is required (a note is required when it is `other`). */
  reasonCode: boolean;
  /** A verified, fresh delivery OTP is required (BR-D38). */
  otpVerified: boolean;
}

const NO_REQUIREMENTS: MoveRequirements = { reason: false, reasonCode: false, otpVerified: false };

const REQUIREMENTS: Partial<Record<DeliveryMove, Partial<MoveRequirements>>> = {
  rejected: { reason: true },
  reassigned: { reason: true },
  unassigned: { reason: true },
  force_failed: { reason: true },
  returned: { reason: true },
  cancelled: { reason: true },
  failed_attempt: { reasonCode: true },
  delivered: { otpVerified: true },
};

/** What a move needs beyond the allowed status and actor (payment and proof are added by U8.2 gates). */
export function requirementsFor(move: DeliveryMove): MoveRequirements {
  return { ...NO_REQUIREMENTS, ...(REQUIREMENTS[move] ?? {}) };
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  new: 'Waiting for a partner',
  assigned: 'Assigned',
  accepted: 'Accepted',
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
  arrived: 'Arrived',
  delivered: 'Delivered',
  failed_attempt: 'Attempt failed',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

/** Why a job needs the admin's attention (shown as a badge). */
export const DELIVERY_ATTENTION_REASONS = ['rejected', 'no_reply', 'max_attempts', 'payment_review'] as const;
export type DeliveryAttention = (typeof DELIVERY_ATTENTION_REASONS)[number];

/** Whether a partner may retry after a failed attempt (BR-D41). */
export function canRetry(attemptsUsed: number, maxAttempts: number): boolean {
  return attemptsUsed < maxAttempts;
}
