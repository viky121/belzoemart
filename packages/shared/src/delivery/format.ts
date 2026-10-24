/** Small pure helpers for delivery data (BR-D1, BR-D30, BR-D71). */

const MOBILE_RE = /^[6-9]\d{9}$/;
const PINCODE_RE = /^[1-9]\d{5}$/;

/**
 * Normalise an Indian mobile number to 10 digits. Accepts spaces, dashes, a `+91`, `91` or `0`
 * prefix. Returns null when the result is not a valid mobile (starts with 6 to 9, 10 digits).
 * Normalising an already normalised number returns it unchanged.
 */
export function normalizeMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return MOBILE_RE.test(digits) ? digits : null;
}

/** `+91 98765 43210` for display. */
export function formatMobile(mobile: string): string {
  return `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
}

/** `XXXXXX3210`: only the last 4 digits are shown (SP7). */
export function maskMobile(mobile: string | null | undefined): string {
  if (!mobile) return '';
  const digits = mobile.replace(/\D/g, '');
  if (digits.length <= 4) return 'X'.repeat(digits.length);
  return `${'X'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

export function isValidPincode(pincode: string | null | undefined): boolean {
  return PINCODE_RE.test(pincode ?? '');
}

/** Letters and digits without look-alikes (no 0, O, 1, I). */
export const JOB_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const JOB_CODE_LENGTH = 8;
export const JOB_CODE_PREFIX = 'DLV-';

export function formatJobCode(chars: string): string {
  return `${JOB_CODE_PREFIX}${chars}`;
}

export function isJobCode(code: string): boolean {
  if (!code.startsWith(JOB_CODE_PREFIX)) return false;
  const body = code.slice(JOB_CODE_PREFIX.length);
  return body.length === JOB_CODE_LENGTH && [...body].every((c) => JOB_CODE_ALPHABET.includes(c));
}

export interface AddressParts {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

/** One line of address text. */
export function addressLine(a: AddressParts): string {
  return [a.line1, a.line2, a.city, a.state, a.pincode]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

/** Google Maps search link made from the address text, so no map key is needed (BR-D71). */
export function mapsSearchUrl(a: AddressParts): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine(a))}`;
}

/** True when the string has a control character (used to reject odd input in reasons and notes). */
export function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
}
