import { z } from 'zod';
import { strongPasswordSchema } from '../schemas';

/**
 * Common passwords refused for delivery partners (SP3). Compared after lowercasing and
 * removing everything that is not a letter or digit, and again after trimming trailing digits.
 */
const COMMON = new Set([
  'password', 'passw0rd', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm',
  'letmein', 'welcome', 'admin', 'administrator', 'login', 'master', 'monkey', 'dragon',
  'iloveyou', 'abc123', 'abcdef', 'abcdefgh', 'changeme', 'default', 'secret', 'football',
  'cricket', 'india', 'bharat', 'namaste', 'krishna', 'shiva', 'ganesh', 'hanuman', 'ramram',
  'sachin', 'virat', 'rohit', 'dhoni', 'sunshine', 'princess', 'superman', 'batman', 'shadow',
  'trustno1', 'whatever', 'freedom', 'hello', 'hellohello', 'test', 'testing', 'guest', 'user',
  'delivery', 'partner', 'belzo', 'belzoemart', 'emart', 'rider', 'driver', 'deliveryboy',
  'mobile', 'phone', 'number', 'pass', 'pass1234', 'passcode', 'abcd', 'abcd1234', 'aaaaaa',
]);

function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True when the password is a well-known one (with or without digits or symbols added at the end). */
export function isCommonPassword(password: string): boolean {
  const flat = squash(password);
  if (COMMON.has(flat)) return true;
  const noTrailingDigits = flat.replace(/\d+$/, '');
  return noTrailingDigits.length > 0 && COMMON.has(noTrailingDigits);
}

/** True when the password contains 8 digits in a row from the partner's own mobile number. */
export function containsMobile(password: string, mobile: string | null | undefined): boolean {
  const digits = (mobile ?? '').replace(/\D/g, '');
  if (digits.length < 8) return false;
  const pw = password.replace(/\D/g, '');
  for (let i = 0; i + 8 <= digits.length; i += 1) {
    if (pw.includes(digits.slice(i, i + 8))) return true;
  }
  return false;
}

/** Plain-language problems with a partner password (empty = acceptable). */
export function deliveryPasswordProblems(password: string, mobile?: string | null): string[] {
  const problems: string[] = [];
  const parsed = strongPasswordSchema.safeParse(password);
  if (!parsed.success) problems.push(...parsed.error.issues.map((i) => i.message));
  if (isCommonPassword(password)) problems.push('Password is too common');
  if (containsMobile(password, mobile)) problems.push('Password must not contain your mobile number');
  return problems;
}

/** Password rules without the mobile check (the mobile is checked at object level). */
export const deliveryPasswordSchema = strongPasswordSchema.refine((p) => !isCommonPassword(p), {
  message: 'Password is too common',
});

export type DeliveryPasswordInput = z.infer<typeof deliveryPasswordSchema>;
