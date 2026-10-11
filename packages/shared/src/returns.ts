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

/**
 * Find a return reason by exact code, else by a case-insensitive match of the
 * label against the text before the first ':' (composeReason output).
 */
export function findReturnReason(codeOrText: string | null | undefined): ReturnReason | undefined {
  if (!codeOrText) return undefined;
  const byCode = RETURN_REASONS.find((r) => r.code === codeOrText);
  if (byCode) return byCode;
  const head = (codeOrText.split(':')[0] ?? '').trim().toLowerCase();
  if (!head) return undefined;
  return RETURN_REASONS.find((r) => r.label.toLowerCase() === head);
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
