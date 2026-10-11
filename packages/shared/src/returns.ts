/**
 * Return / cancellation reason catalogues shared by the storefront and the API,
 * so both apply the same "photos required" rule.
 */

export const RETURN_REASON_CODES = [
  'damaged',
  'defective',
  'wrong_item',
  'missing_item',
  'expired',
  'quality',
  'size_fit',
  'not_needed',
  'other',
] as const;
export type ReturnReasonCode = (typeof RETURN_REASON_CODES)[number];

export interface ReturnReason {
  code: ReturnReasonCode;
  label: string;
  /** At least one photo of the product must be attached. */
  photoRequired: boolean;
  /** A replacement may be offered as the resolution. */
  allowReplace: boolean;
  /** The customer must describe the problem. */
  commentRequired: boolean;
}

export const RETURN_REASONS: readonly ReturnReason[] = [
  { code: 'damaged', label: 'Damaged / broken product', photoRequired: true, allowReplace: true, commentRequired: false },
  { code: 'defective', label: 'Defective / not working', photoRequired: true, allowReplace: true, commentRequired: false },
  { code: 'wrong_item', label: 'Wrong item received', photoRequired: true, allowReplace: true, commentRequired: false },
  { code: 'missing_item', label: 'Item missing / incomplete', photoRequired: true, allowReplace: true, commentRequired: false },
  { code: 'expired', label: 'Expired / near expiry', photoRequired: true, allowReplace: true, commentRequired: false },
  { code: 'quality', label: 'Quality not as expected', photoRequired: false, allowReplace: true, commentRequired: false },
  { code: 'size_fit', label: 'Size / fit issue', photoRequired: false, allowReplace: true, commentRequired: false },
  { code: 'not_needed', label: 'No longer needed', photoRequired: false, allowReplace: false, commentRequired: false },
  { code: 'other', label: 'Other', photoRequired: false, allowReplace: false, commentRequired: true },
];

export const CANCEL_REASON_CODES = [
  'ordered_by_mistake',
  'better_price',
  'delivery_too_long',
  'change_address',
  'change_items',
  'payment_issue',
  'other',
] as const;
export type CancelReasonCode = (typeof CANCEL_REASON_CODES)[number];

export interface CancelReason {
  code: CancelReasonCode;
  label: string;
  commentRequired: boolean;
}

export const CANCEL_REASONS: readonly CancelReason[] = [
  { code: 'ordered_by_mistake', label: 'Ordered by mistake', commentRequired: false },
  { code: 'better_price', label: 'Found a better price elsewhere', commentRequired: false },
  { code: 'delivery_too_long', label: 'Delivery is taking too long', commentRequired: false },
  { code: 'change_address', label: 'Want to change address / phone', commentRequired: false },
  { code: 'change_items', label: 'Want to change items or quantity', commentRequired: false },
  { code: 'payment_issue', label: 'Payment issue', commentRequired: false },
  { code: 'other', label: 'Other', commentRequired: true },
];

export const MAX_RETURN_IMAGES = 6;
export const REASON_MAX_CHARS = 300;
export const OTHER_REASON_MIN_CHARS = 10;

/** Lowercase, `_` → space, collapse whitespace, and normalise spacing around '/'. */
function normalizeReasonKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .trim();
}

/**
 * Find a return reason by code, else by the text before the first ':'
 * (composeReason output) matched against the label or the code. Matching is
 * case-insensitive and tolerant of spacing ("Damaged/broken product",
 * "Wrong item", "DAMAGED").
 */
export function findReturnReason(codeOrText: string | null | undefined): ReturnReason | undefined {
  if (!codeOrText) return undefined;
  const byCode = RETURN_REASONS.find((r) => r.code === codeOrText);
  if (byCode) return byCode;
  const head = normalizeReasonKey(codeOrText.split(':')[0] ?? '');
  if (!head) return undefined;
  return RETURN_REASONS.find((r) => normalizeReasonKey(r.label) === head || normalizeReasonKey(r.code) === head);
}

/**
 * The customer's own comments inside a composed reason: the text after the
 * reason label (and its ':'), or the whole text when it does not start with it.
 */
export function reasonComments(reason: ReturnReason, text: string | null | undefined): string {
  const t = (text ?? '').trim();
  const colon = t.indexOf(':');
  const head = colon >= 0 ? t.slice(0, colon) : t;
  const key = normalizeReasonKey(head);
  if (key === normalizeReasonKey(reason.label) || key === normalizeReasonKey(reason.code)) {
    return colon >= 0 ? t.slice(colon + 1).trim() : '';
  }
  return t;
}

/** Photos are required when either the code or the reason text says so (stricter wins). */
export function returnReasonRequiresPhotos(input: { reasonCode?: string | null; reason?: string | null }): boolean {
  return Boolean(findReturnReason(input.reasonCode)?.photoRequired || findReturnReason(input.reason)?.photoRequired);
}

/** `"<label>: <comments>"` (or just the label), capped at `max` characters. */
export function composeReason(label: string, comments?: string | null, max: number = REASON_MAX_CHARS): string {
  const c = (comments ?? '').trim();
  const text = c ? `${label}: ${c}` : label;
  return text.length > max ? text.slice(0, max) : text;
}
