/** Keep only the digits of what was typed into a quantity box (no minus sign, dot or letters). */
export function cleanQtyDraft(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 3);
}

/**
 * Turn a typed quantity into a valid one: a whole number from `min` to `max`.
 * An empty or non-numeric box gives `fallback` (the quantity it had before), so clearing the box
 * and leaving it never leaves the cart with an invalid number.
 */
export function parseQty(raw: string, min: number, max: number, fallback: number): number {
  const digits = cleanQtyDraft(raw);
  if (digits === '') return fallback;
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
