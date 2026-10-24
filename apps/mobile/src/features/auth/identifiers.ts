import { emailSchema } from '@belzo/shared';

/** The 10-digit Indian mobile in `raw` (spaces, dashes and a +91 prefix are fine), or null. */
export function normalizeMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** The trimmed, lower-cased email in `raw`, or null when it is not a valid address. */
export function normalizeEmail(raw: string): string | null {
  const parsed = emailSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
