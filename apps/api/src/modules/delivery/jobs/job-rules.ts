import {
  DELIVERY_EDGES,
  DELIVERY_FINAL_STATUSES,
  canRetry,
  hasControlChars,
  requirementsFor,
  type DeliveryActorKind,
  type DeliveryAttention,
  type DeliveryLocation,
  type DeliveryMove,
  type DeliverySettings,
  type DeliveryStatus,
  type FailReasonCode,
  FAIL_REASON_CODES,
} from '@belzo/shared';
import { fail, type RuleFailure } from '../delivery-errors';
import { isVerificationFresh } from '../otp/otp-rules';

/**
 * The pure core of the job state machine (BR-D20 to BR-D26, BR-D38, BR-D40 to BR-D42).
 * `planMove` looks at a job, a move and who asks, and either refuses with a clear reason or
 * returns exactly what must change. It never touches the database, so the engine only has to
 * carry out the plan, and the property tests can run thousands of random command sequences.
 */

/** The fields of a job the rules look at. */
export interface JobFacts {
  status: DeliveryStatus;
  partnerId: string | null;
  attemptsUsed: number;
  maxAttempts: number;
  attention: DeliveryAttention | null;
}

export interface Actor {
  kind: DeliveryActorKind;
  id: string | null;
}

export interface MoveInput {
  /** Free-text reason (3 to 255 characters) for the moves that need one. */
  reason?: string;
  /** Why an attempt failed. */
  reasonCode?: FailReasonCode;
  /** Extra note; required when the reason code is `other`. */
  note?: string;
  location?: DeliveryLocation;
  /** The partner to assign (assigned, reassigned). */
  targetPartnerId?: string;
}

export interface PlanContext {
  now: Date;
  settings: DeliverySettings;
  /** True when the Belzo order has been cancelled (BR-D24). */
  orderCancelled: boolean;
  /** When the current attempt's OTP was verified, or null. */
  otpVerifiedAt: Date | null;
}

export type AssignmentOutcome = 'accepted' | 'rejected' | 'expired' | 'unassigned' | 'reassigned' | 'completed' | 'cancelled';

/** Changes to write on the job row. `undefined` means "leave as it is"; `null` clears the column. */
export interface JobPatch {
  status: DeliveryStatus;
  partnerId?: string | null;
  attemptsUsed?: number;
  attention?: DeliveryAttention | null;
  acceptDeadlineAt?: Date | null;
  deliveredAt?: Date;
  endedAt?: Date;
  trackingExpiresAt?: Date;
}

export interface MovePlan {
  ok: true;
  replay: false;
  move: DeliveryMove;
  from: DeliveryStatus;
  to: DeliveryStatus;
  patch: JobPatch;
  /** Mark the open assignment as accepted (the partner said yes). */
  acceptAssignment?: boolean;
  /** Close the open assignment with this outcome. */
  closeAssignment?: { outcome: AssignmentOutcome; reason?: string };
  /** Open a new assignment for this partner. */
  openAssignment?: { partnerId: string; deadline: Date };
  /** A new delivery OTP must be made (start and retry). */
  issueOtp: boolean;
  /** The active OTP must be retired (the attempt is over). */
  retireOtp: boolean;
  event: { event: DeliveryMove; reasonCode: string | null; note: string | null; attemptNo: number | null };
}

export interface ReplayPlan {
  ok: true;
  replay: true;
}

export type PlanResult = MovePlan | ReplayPlan | RuleFailure;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function cleanText(s: string | undefined): string | null {
  const t = (s ?? '').trim();
  return t.length === 0 ? null : t;
}

function validText(s: string | null, min: number, max: number): s is string {
  return s !== null && s.length >= min && s.length <= max && !hasControlChars(s);
}

/** A partner may repeat a command that already happened without causing a second effect (BR-D23). */
export function isReplay(job: Pick<JobFacts, 'status'>, move: DeliveryMove, actor: Actor): boolean {
  if (actor.kind !== 'partner') return false;
  const edge = DELIVERY_EDGES[move];
  if (job.status !== edge.to) return false;
  // `rejected` ends in `new` where the partner no longer holds the job, so it is never a replay here.
  return move !== 'rejected';
}

export function planMove(job: JobFacts, move: DeliveryMove, actor: Actor, input: MoveInput, ctx: PlanContext): PlanResult {
  const edge = DELIVERY_EDGES[move];

  if (!edge.actors.includes(actor.kind)) {
    return fail(403, 'FORBIDDEN', 'You are not allowed to do this');
  }
  if (actor.kind === 'partner' && (job.partnerId === null || job.partnerId !== actor.id)) {
    return fail(404, 'NOT_FOUND', 'Delivery not found');
  }
  if (isReplay(job, move, actor)) return { ok: true, replay: true };

  if (!edge.from.includes(job.status)) {
    return fail(409, 'INVALID_TRANSITION', 'This is not possible at the moment', { status: job.status, move });
  }
  if (ctx.orderCancelled && actor.kind === 'partner') {
    return fail(409, 'ORDER_CANCELLED', 'This order was cancelled. Do not deliver it.');
  }

  const need = requirementsFor(move);
  const reason = cleanText(input.reason);
  const note = cleanText(input.note);

  if (need.reason && !validText(reason, 3, 255)) {
    return fail(422, 'INVALID_INPUT', 'Please give a reason (3 to 255 characters)');
  }
  if (need.reasonCode) {
    if (!input.reasonCode || !FAIL_REASON_CODES.includes(input.reasonCode)) {
      return fail(422, 'INVALID_INPUT', 'Please choose why the delivery failed');
    }
    if (input.reasonCode === 'other' && !validText(note, 3, 255)) {
      return fail(422, 'INVALID_INPUT', 'Please describe the reason (3 to 255 characters)');
    }
  }
  if (note !== null && !validText(note, 1, 255)) {
    return fail(422, 'INVALID_INPUT', 'The note is too long or has invalid characters');
  }

  const base = {
    ok: true as const,
    replay: false as const,
    move,
    from: job.status,
    to: edge.to,
    issueOtp: false,
    retireOtp: false,
  };
  const finalPatch = (): Pick<JobPatch, 'endedAt' | 'trackingExpiresAt'> => ({
    endedAt: ctx.now,
    trackingExpiresAt: new Date(ctx.now.getTime() + ctx.settings.trackingDays * DAY),
  });
  const attemptNo = job.attemptsUsed + 1;

  switch (move) {
    case 'assigned':
    case 'reassigned': {
      if (!input.targetPartnerId) return fail(422, 'INVALID_INPUT', 'Choose a delivery partner');
      return {
        ...base,
        patch: {
          status: 'assigned',
          partnerId: input.targetPartnerId,
          attention: null,
          acceptDeadlineAt: new Date(ctx.now.getTime() + ctx.settings.acceptTimeoutMinutes * MINUTE),
          ...(move === 'reassigned' ? { attemptsUsed: 0 } : {}),
        },
        ...(move === 'reassigned' ? { closeAssignment: { outcome: 'reassigned' as const, reason: reason ?? undefined } } : {}),
        openAssignment: { partnerId: input.targetPartnerId, deadline: new Date(ctx.now.getTime() + ctx.settings.acceptTimeoutMinutes * MINUTE) },
        retireOtp: move === 'reassigned',
        event: { event: move, reasonCode: null, note: reason, attemptNo: null },
      };
    }
    case 'accepted':
      return {
        ...base,
        patch: { status: 'accepted', acceptDeadlineAt: null },
        acceptAssignment: true,
        event: { event: move, reasonCode: null, note: null, attemptNo: null },
      };
    case 'rejected':
    case 'expired':
    case 'unassigned':
      return {
        ...base,
        patch: {
          status: 'new',
          partnerId: null,
          acceptDeadlineAt: null,
          attention: move === 'rejected' ? 'rejected' : move === 'expired' ? 'no_reply' : null,
        },
        closeAssignment: { outcome: move, reason: reason ?? undefined },
        event: { event: move, reasonCode: null, note: reason, attemptNo: null },
      };
    case 'picked_up':
    case 'arrived':
      return { ...base, patch: { status: edge.to }, event: { event: move, reasonCode: null, note: null, attemptNo: move === 'arrived' ? attemptNo : null } };
    case 'out_for_delivery':
      return { ...base, patch: { status: 'out_for_delivery' }, issueOtp: true, event: { event: move, reasonCode: null, note: null, attemptNo } };
    case 'retry':
      if (!canRetry(job.attemptsUsed, job.maxAttempts)) {
        return fail(409, 'MAX_ATTEMPTS_REACHED', 'The maximum number of delivery attempts has been reached. The office will decide what happens next.');
      }
      return { ...base, patch: { status: 'out_for_delivery' }, issueOtp: true, event: { event: move, reasonCode: null, note: null, attemptNo } };
    case 'failed_attempt':
    case 'force_failed': {
      const used = job.attemptsUsed + 1;
      return {
        ...base,
        patch: { status: 'failed_attempt', attemptsUsed: used, ...(used >= job.maxAttempts ? { attention: 'max_attempts' as const } : {}) },
        retireOtp: true,
        event: {
          event: move,
          reasonCode: move === 'failed_attempt' ? (input.reasonCode ?? null) : null,
          note: move === 'failed_attempt' ? note : reason,
          attemptNo,
        },
      };
    }
    case 'delivered': {
      if (!ctx.otpVerifiedAt) return fail(409, 'OTP_NOT_VERIFIED', 'Enter the code the customer received before marking the order delivered');
      if (!isVerificationFresh(ctx.otpVerifiedAt, ctx.now, ctx.settings)) {
        return fail(409, 'OTP_STALE', 'The code was checked too long ago. Ask the customer for the code again.');
      }
      return {
        ...base,
        patch: { status: 'delivered', deliveredAt: ctx.now, ...finalPatch() },
        closeAssignment: { outcome: 'completed' },
        event: { event: move, reasonCode: null, note: null, attemptNo },
      };
    }
    case 'returned':
    case 'cancelled':
      return {
        ...base,
        patch: { status: edge.to, acceptDeadlineAt: null, ...finalPatch() },
        closeAssignment: { outcome: 'cancelled', reason: reason ?? undefined },
        retireOtp: true,
        event: { event: move, reasonCode: null, note: reason, attemptNo: null },
      };
  }
}

/** Apply a plan to the job facts (the same change the engine writes to the database). */
export function applyPlan(job: JobFacts, plan: MovePlan): JobFacts {
  const p = plan.patch;
  return {
    status: p.status,
    partnerId: p.partnerId === undefined ? job.partnerId : p.partnerId,
    attemptsUsed: p.attemptsUsed ?? job.attemptsUsed,
    maxAttempts: job.maxAttempts,
    attention: p.attention === undefined ? job.attention : p.attention,
  };
}

export function isFinalStatus(s: DeliveryStatus): boolean {
  return DELIVERY_FINAL_STATUSES.includes(s);
}
