import type { DeliveryJob } from '@prisma/client';
import {
  canRetry,
  mapsSearchUrl,
  nextMoves,
  type AdminJobRow,
  type DeliveryMove,
  type DeliveryStatus,
  type PartnerJobDetail,
  type PartnerJobPreview,
} from '@belzo/shared';
import type { OtpStepView } from '../otp/delivery-otp.service';

/**
 * Pure mapping from stored jobs to the shapes the apps receive. The partner shapes are separate
 * types so a field that must stay hidden before Accept cannot be added to the preview by accident
 * (BR-D70, BR-D71, SP2).
 */

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Name of the partner command that runs each move (the app's button / endpoint name). */
const COMMAND_OF_MOVE: Partial<Record<DeliveryMove, string>> = {
  accepted: 'accept',
  rejected: 'reject',
  picked_up: 'pickup',
  out_for_delivery: 'start',
  arrived: 'arrive',
  failed_attempt: 'fail',
  delivered: 'complete',
  retry: 'retry',
};

/**
 * What the partner can do next from this state (BR-D41, BR-D38). `complete` appears only once the
 * code has been verified recently; `verify_otp` and `resend_otp` are the two OTP buttons.
 */
export function partnerNextActions(
  status: DeliveryStatus,
  attemptsUsed: number,
  maxAttempts: number,
  otp: { verified: boolean; fresh: boolean },
): string[] {
  const actions: string[] = [];
  for (const move of nextMoves(status, 'partner')) {
    if (move === 'retry' && !canRetry(attemptsUsed, maxAttempts)) continue;
    if (move === 'delivered' && !(otp.verified && otp.fresh)) continue;
    const command = COMMAND_OF_MOVE[move];
    if (command) actions.push(command);
  }
  if (status === 'arrived' && !(otp.verified && otp.fresh)) actions.push('verify_otp');
  if (status === 'out_for_delivery' || status === 'arrived') actions.push('resend_otp');
  return actions.sort((a, b) => ACTION_ORDER.indexOf(a) - ACTION_ORDER.indexOf(b));
}

/** The order buttons are shown in: the main step first, "send the code again" last. */
const ACTION_ORDER = ['accept', 'reject', 'pickup', 'start', 'arrive', 'verify_otp', 'complete', 'retry', 'fail', 'resend_otp'];

/** Job as the partner sees it while the status is `assigned`: the area, the size and the money, nothing personal. */
export function toPartnerPreview(job: DeliveryJob): PartnerJobPreview {
  return {
    kind: 'preview',
    id: job.id,
    code: job.code,
    status: job.status,
    city: job.destCity,
    pincode: job.destPincode,
    itemCount: job.itemCount,
    paymentMode: job.paymentMode,
    codAmount: job.codAmount,
    assignedAt: job.createdAt.toISOString(),
    responseDeadlineAt: iso(job.acceptDeadlineAt),
  };
}

/** Job as the partner sees it after Accept, and in history. */
export function toPartnerDetail(
  job: DeliveryJob,
  items: { title: string; quantity: number }[],
  otp: OtpStepView,
  fresh: boolean,
): PartnerJobDetail {
  const address = { line1: job.destLine1, line2: job.destLine2, city: job.destCity, state: job.destState, pincode: job.destPincode };
  return {
    kind: 'detail',
    id: job.id,
    code: job.code,
    status: job.status,
    paymentMode: job.paymentMode,
    codAmount: job.codAmount,
    itemCount: job.itemCount,
    items,
    destName: job.destName,
    destPhone: job.destPhone,
    address,
    mapsUrl: mapsSearchUrl(address),
    attemptsUsed: job.attemptsUsed,
    maxAttempts: job.maxAttempts,
    canRetry: canRetry(job.attemptsUsed, job.maxAttempts),
    otp,
    nextActions: partnerNextActions(job.status, job.attemptsUsed, job.maxAttempts, { verified: otp.verified, fresh }),
    assignedAt: job.createdAt.toISOString(),
    deliveredAt: iso(job.deliveredAt),
  };
}

export interface PartnerLite {
  id: string;
  name: string;
  isActive: boolean;
}

export function toAdminRow(job: DeliveryJob, partner: PartnerLite | undefined): AdminJobRow {
  return {
    id: job.id,
    code: job.code,
    orderId: job.orderId,
    status: job.status,
    attention: job.attention,
    partnerId: job.partnerId,
    partnerName: partner?.name ?? null,
    partnerActive: partner ? partner.isActive : null,
    destCity: job.destCity,
    destPincode: job.destPincode,
    paymentMode: job.paymentMode,
    codAmount: job.codAmount,
    attemptsUsed: job.attemptsUsed,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
