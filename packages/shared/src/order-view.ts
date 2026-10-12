import type { OrderStatus } from './constants';
import { ORDER_PROGRESS_STEPS, progressRank, statusLabel, type ReconciledTracking } from './order-tracking';
import { canCustomerCancel } from './orders';
import {
  CANCEL_REASONS,
  MAX_RETURN_IMAGES,
  OTHER_REASON_MIN_CHARS,
  REASON_MAX_CHARS,
  RETURN_REASONS,
  composeReason,
  findReturnReason,
  returnReasonRequiresPhotos,
  type ReturnReasonCode,
} from './returns';
import { formatInr } from './format';
import type { OrderMoneySnapshot } from './price-breakup';
import { pickAttr } from './attributes';

/**
 * Pure view helpers for the customer order-detail page (GET /orders/:id).
 * Everything the page shows is derived from the order status and the
 * reconciled tracking payload; no dates or amounts are invented here.
 */

export interface OrderAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderDetailItem {
  id: string;
  variantId: string;
  title: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  taxRatePct: number;
  imageUrl: string | null;
  slug: string | null;
  isReturnable: boolean;
  attributes: Record<string, string>;
}

export interface OrderPayment {
  provider: string;
  status: string;
  method: string | null;
  amount: number;
  createdAt: string;
}

export type ReturnStatus = 'requested' | 'approved' | 'picked' | 'received' | 'refunded' | 'rejected';
export type ReturnResolution = 'refund_source' | 'refund_wallet' | 'replace';

export interface OrderReturn {
  id: string;
  status: ReturnStatus;
  reason: string;
  resolution: ReturnResolution;
  images: string[];
  items: { orderItemId: string; quantity: number }[];
  createdAt: string;
  updatedAt: string;
}

/** Customer order detail as returned by GET /orders/:id. */
export interface OrderDetail extends OrderMoneySnapshot {
  id: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  couponCode: string | null;
  cancelledReason: string | null;
  invoiceUrl: string | null;
  invoice: { number: string; createdAt: string } | null;
  address: OrderAddress | null;
  items: OrderDetailItem[];
  payments: OrderPayment[];
  returns: OrderReturn[];
  tracking: ReconciledTracking;
}

export type Tone = 'ok' | 'info' | 'warn' | 'bad' | 'muted';

/** "Order #1A2B3C4D" style short id. */
export function shortOrderId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/** Human status label + badge tone (`ord-badge--<tone>`). */
export function statusBadge(status: string): { label: string; tone: Tone } {
  const tone: Tone =
    status === 'delivered'
      ? 'ok'
      : status === 'cancelled'
        ? 'bad'
        : status === 'returned'
          ? 'muted'
          : status === 'pending'
            ? 'warn'
            : 'info';
  return { label: statusLabel(status), tone };
}

/** False once the order can no longer change by itself (stop polling). */
export function isLiveStatus(status: string): boolean {
  return status !== 'delivered' && status !== 'cancelled' && status !== 'returned';
}

// ---------------------------------------------------------------------------
// Progress stepper
// ---------------------------------------------------------------------------

export type StepState = 'done' | 'current' | 'upcoming' | 'terminal';

export interface Step {
  key: string;
  label: string;
  state: StepState;
  /** ISO time when known, else null (never invented). */
  at: string | null;
}

function earliest(times: (string | null | undefined)[]): string | null {
  let best: number | null = null;
  for (const t of times) {
    if (!t) continue;
    const n = Date.parse(t);
    if (Number.isFinite(n) && (best === null || n < best)) best = n;
  }
  return best === null ? null : new Date(best).toISOString();
}

function stepTime(order: OrderDetail, step: OrderStatus): string | null {
  if (step === 'pending') return order.createdAt ?? null;
  if (step === 'confirmed') return order.invoice?.createdAt ?? null;
  const times: (string | null)[] = [];
  for (const s of order.tracking?.shipments ?? []) {
    for (const e of s.events) {
      const rank = progressRank(e.status);
      if (rank >= 0 && ORDER_PROGRESS_STEPS[rank] === step) times.push(e.occurredAt);
    }
  }
  return earliest(times);
}

function refundStep(order: OrderDetail): Step | null {
  const refundedReturns = order.returns.filter((r) => r.status === 'refunded');
  const paymentRefunded = order.payments.some(
    (p) => p.status === 'refunded' || p.status === 'partially_refunded',
  );
  if (refundedReturns.length === 0 && !paymentRefunded) return null;
  return {
    key: 'refunded',
    label: 'Refunded',
    state: 'terminal',
    at: earliest(refundedReturns.map((r) => r.updatedAt)),
  };
}

/** Progress steps driven only by the order status. */
export function buildStepper(order: OrderDetail): Step[] {
  const steps: Step[] = [];
  if (order.status === 'cancelled') {
    steps.push({ key: 'pending', label: statusLabel('pending'), state: 'done', at: order.createdAt ?? null });
    // No status history: order.updatedAt also moves on unrelated writes (invoice), so no time.
    steps.push({ key: 'cancelled', label: statusLabel('cancelled'), state: 'terminal', at: null });
  } else if (order.status === 'returned') {
    for (const s of ORDER_PROGRESS_STEPS) {
      steps.push({ key: s, label: statusLabel(s), state: 'done', at: stepTime(order, s) });
    }
    steps.push({ key: 'returned', label: statusLabel('returned'), state: 'terminal', at: null });
  } else {
    const rank = progressRank(order.status);
    ORDER_PROGRESS_STEPS.forEach((s, i) => {
      const state: StepState = i < rank ? 'done' : i === rank ? 'current' : 'upcoming';
      steps.push({ key: s, label: statusLabel(s), state, at: state === 'upcoming' ? null : stepTime(order, s) });
    });
  }
  const refund = refundStep(order);
  if (refund) steps.push(refund);
  return steps;
}

// ---------------------------------------------------------------------------
// Payment + refund
// ---------------------------------------------------------------------------

const METHOD_LABELS: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Net banking',
  wallet: 'Wallet',
  emi: 'EMI',
};

const SETTLED = ['captured', 'refunded', 'partially_refunded'];

/** The payment that matters for display: a settled one, else the newest attempt. */
function primaryPayment(order: OrderDetail): OrderPayment | null {
  const settled = order.payments.find((p) => SETTLED.includes(p.status));
  if (settled) return settled;
  let newest: OrderPayment | null = null;
  for (const p of order.payments) {
    if (!newest || Date.parse(p.createdAt) > Date.parse(newest.createdAt)) newest = p;
  }
  return newest;
}

export interface PaymentSummary {
  methodLabel: string;
  statusLabel: string;
  isCod: boolean;
  /** A non-COD payment was taken (captured or since refunded). */
  isPrepaid: boolean;
  /** Captured amount in paise, else 0. */
  amountPaid: number;
}

export function paymentSummary(order: OrderDetail): PaymentSummary {
  const p = primaryPayment(order);
  if (!p) {
    return { methodLabel: 'Not available', statusLabel: 'Not available', isCod: false, isPrepaid: false, amountPaid: 0 };
  }
  const isCod = p.provider === 'cod' || p.method === 'cod';
  const methodLabel = isCod ? 'Cash on Delivery' : (METHOD_LABELS[(p.method ?? '').toLowerCase()] ?? 'Online payment');
  let label: string;
  switch (p.status) {
    case 'captured':
      label = 'Paid';
      break;
    case 'failed':
      label = 'Payment failed';
      break;
    case 'refunded':
      label = 'Refunded';
      break;
    case 'partially_refunded':
      label = 'Partially refunded';
      break;
    case 'pending':
      if (isCod) {
        label =
          order.status === 'delivered' || order.status === 'returned'
            ? 'Paid on delivery'
            : order.status === 'cancelled'
              ? 'Not charged'
              : 'Pay on delivery';
      } else {
        label = 'Awaiting payment';
      }
      break;
    default:
      label = 'Awaiting payment';
  }
  return {
    methodLabel,
    statusLabel: label,
    isCod,
    isPrepaid: !isCod && SETTLED.includes(p.status),
    amountPaid: p.status === 'captured' ? p.amount : 0,
  };
}

/** What happens to the customer's money if the order is cancelled. */
export function refundNote(order: OrderDetail): string {
  const p = primaryPayment(order);
  const summary = paymentSummary(order);
  if (summary.isPrepaid && p) {
    return `A refund of ${formatInr(p.amount)} will be issued to your original payment method`;
  }
  if (summary.isCod) return 'Nothing to refund - this is a Cash on Delivery order';
  return 'No payment was taken for this order';
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export function cancelEligibility(order: OrderDetail): boolean {
  return canCustomerCancel(order.status);
}

/** Why Cancel is not offered for an order that is still on its way, else null. */
export function cancelUnavailableReason(order: OrderDetail): string | null {
  if (canCustomerCancel(order.status) || !isLiveStatus(order.status)) return null;
  return "Orders can't be cancelled once they are packed";
}

/** Max comment length so that "<label>: <comments>" stays within REASON_MAX_CHARS. */
export function commentMaxChars(label: string): number {
  return Math.max(0, REASON_MAX_CHARS - label.length - 2);
}

export function cancelReasonError(code: string | null, comments: string): string | null {
  const reason = CANCEL_REASONS.find((r) => r.code === code);
  if (!reason) return 'Please choose a reason for cancelling';
  if (reason.commentRequired && comments.trim().length < OTHER_REASON_MIN_CHARS) {
    return `Please tell us a little more (at least ${OTHER_REASON_MIN_CHARS} characters)`;
  }
  return null;
}

export function cancelReasonText(code: string, comments: string): string {
  const reason = CANCEL_REASONS.find((r) => r.code === code);
  return composeReason(reason?.label ?? 'Other', comments);
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

export interface ReturnItemEligibility {
  id: string;
  maxQty: number;
  returnable: boolean;
  blockedReason: string | null;
}

export interface ReturnEligibility {
  eligible: boolean;
  reason: string | null;
  items: ReturnItemEligibility[];
}

/** Quantity of each order item already in a non-rejected return. */
function requestedQty(order: OrderDetail): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of order.returns) {
    if (r.status === 'rejected') continue;
    for (const it of r.items) m.set(it.orderItemId, (m.get(it.orderItemId) ?? 0) + it.quantity);
  }
  return m;
}

export function returnEligibility(order: OrderDetail): ReturnEligibility {
  const requested = requestedQty(order);
  const items: ReturnItemEligibility[] = order.items.map((i) => {
    if (!i.isReturnable) return { id: i.id, maxQty: 0, returnable: false, blockedReason: 'Non-returnable item' };
    const maxQty = Math.max(0, i.quantity - (requested.get(i.id) ?? 0));
    return {
      id: i.id,
      maxQty,
      returnable: true,
      blockedReason: maxQty === 0 ? 'Return already requested' : null,
    };
  });

  let reason: string | null = null;
  if (order.status === 'cancelled') reason = 'This order was cancelled';
  else if (order.status === 'returned') reason = 'This order has already been returned';
  else if (order.status !== 'delivered') reason = 'Returns can be requested once your order is delivered';
  else if (!items.some((i) => i.maxQty > 0)) {
    reason = items.every((i) => !i.returnable)
      ? 'All items in this order are non-returnable'
      : 'A return has already been requested for all items';
  }
  return { eligible: reason === null, reason, items };
}

export function photosRequired(code: string | null | undefined): boolean {
  return returnReasonRequiresPhotos({ reasonCode: code ?? null });
}

export interface ResolutionOption {
  value: ReturnResolution;
  label: string;
  description: string;
}

export function resolutionOptions(order: OrderDetail, code: string | null | undefined): ResolutionOption[] {
  const opts: ResolutionOption[] = [];
  if (paymentSummary(order).isPrepaid) {
    opts.push({
      value: 'refund_source',
      label: 'Refund to original payment method',
      description: 'Refunded to the account you paid from after the item passes inspection.',
    });
  }
  opts.push({
    value: 'refund_wallet',
    label: 'Refund to Belzo wallet',
    description: paymentSummary(order).isCod
      ? 'Cash on Delivery orders are refunded to your Belzo wallet once we receive the item - use it on your next order.'
      : 'Credited to your wallet once the item is received - use it on your next order.',
  });
  const reason = findReturnReason(code ?? null);
  if (reason?.allowReplace) {
    opts.push({
      value: 'replace',
      label: 'Replacement',
      description: 'We pick up the item and send you a new one.',
    });
  }
  return opts;
}

export interface ReturnDraft {
  /** Order item id -> quantity to return (0 = not selected). */
  quantities: Record<string, number>;
  reasonCode: ReturnReasonCode | null;
  resolution: ReturnResolution | null;
  /** Uploaded photo URLs (verbatim from the upload endpoint). */
  images: string[];
  comments: string;
}

export const RETURN_STEPS = 5;

function stepOneError(order: OrderDetail, draft: ReturnDraft): string | null {
  const elig = returnEligibility(order);
  const selected = order.items.filter((i) => (draft.quantities[i.id] ?? 0) > 0);
  if (selected.length === 0) return 'Select at least one item to return';
  for (const i of selected) {
    const qty = draft.quantities[i.id] ?? 0;
    const max = elig.items.find((e) => e.id === i.id)?.maxQty ?? 0;
    if (max === 0) return `"${i.title}" cannot be returned`;
    if (!Number.isInteger(qty) || qty < 1 || qty > max) {
      return `You can return between 1 and ${max} of "${i.title}"`;
    }
  }
  return null;
}

/** First problem blocking the given step (1..5), or null. Step 5 checks everything. */
export function returnStepError(order: OrderDetail, draft: ReturnDraft, step: number): string | null {
  if (step === 1) return stepOneError(order, draft);
  if (step === 2) {
    return RETURN_REASONS.some((r) => r.code === draft.reasonCode) ? null : 'Choose a reason for the return';
  }
  if (step === 3) {
    const ok = resolutionOptions(order, draft.reasonCode).some((o) => o.value === draft.resolution);
    return ok ? null : 'Choose how you would like this resolved';
  }
  if (step === 4) {
    const reason = findReturnReason(draft.reasonCode);
    if (photosRequired(draft.reasonCode) && draft.images.length < 1) {
      return `Add at least one photo of the product - photos are required for "${reason?.label ?? 'this reason'}" returns`;
    }
    if (draft.images.length > MAX_RETURN_IMAGES) return `You can add up to ${MAX_RETURN_IMAGES} photos`;
    if (reason?.commentRequired && draft.comments.trim().length < OTHER_REASON_MIN_CHARS) {
      return `Please describe the issue (at least ${OTHER_REASON_MIN_CHARS} characters)`;
    }
    return null;
  }
  for (let s = 1; s <= 4; s += 1) {
    const err = returnStepError(order, draft, s);
    if (err) return err;
  }
  return null;
}

export interface ReturnPayload {
  orderId: string;
  reasonCode: ReturnReasonCode;
  reason: string;
  images: string[];
  resolution: ReturnResolution;
  items: { orderItemId: string; quantity: number }[];
}

/** POST /orders/returns body. Call only when returnStepError(..., 5) is null. */
export function buildReturnPayload(order: OrderDetail, draft: ReturnDraft): ReturnPayload {
  const reason = findReturnReason(draft.reasonCode);
  return {
    orderId: order.id,
    reasonCode: (draft.reasonCode ?? 'other') as ReturnReasonCode,
    reason: composeReason(reason?.label ?? 'Other', draft.comments),
    images: draft.images,
    resolution: (draft.resolution ?? 'refund_wallet') as ReturnResolution,
    items: order.items
      .filter((i) => (draft.quantities[i.id] ?? 0) > 0)
      .map((i) => ({ orderItemId: i.id, quantity: draft.quantities[i.id] ?? 0 })),
  };
}

const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  picked: 'Picked up',
  received: 'Received',
  refunded: 'Refunded',
  rejected: 'Rejected',
};

export function returnStatusLabel(status: string): string {
  return (RETURN_STATUS_LABELS as Record<string, string>)[status] ?? statusLabel(status);
}

export function returnStatusTone(status: string): Tone {
  if (status === 'refunded') return 'ok';
  if (status === 'rejected') return 'bad';
  if (status === 'requested') return 'warn';
  return 'info';
}

const RESOLUTION_LABELS: Record<ReturnResolution, string> = {
  refund_source: 'Refund to original payment method',
  refund_wallet: 'Refund to Belzo wallet',
  replace: 'Replacement',
};

export function resolutionLabel(r: string): string {
  return (RESOLUTION_LABELS as Record<string, string>)[r] ?? statusLabel(r);
}

/** "Size: M · Colour: Blue", or '' when the variant has neither. */
export function variantText(attributes: Record<string, string> | null | undefined): string {
  const size = pickAttr(attributes, 'size');
  const colour = pickAttr(attributes, 'colour', 'color');
  return [size && `Size: ${size}`, colour && `Colour: ${colour}`].filter(Boolean).join(' · ');
}
