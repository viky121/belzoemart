/**
 * Money handling for Belzo eMart.
 *
 * All monetary amounts are represented internally as an integer number of
 * paise (1 INR = 100 paise) to avoid floating-point rounding errors. The
 * `Money` type is a branded integer to prevent accidental mixing with plain
 * numbers such as quantities.
 */

export type Money = number & { readonly __brand: 'Money' };

/** Smallest currency unit factor for INR. */
export const PAISE_PER_RUPEE = 100;

/** Construct a Money value from an integer amount of paise. */
export function paise(amount: number): Money {
  if (!Number.isInteger(amount)) {
    throw new RangeError(`Money (paise) must be an integer, received: ${amount}`);
  }
  return amount as Money;
}

/**
 * Convert a rupee amount (which may have up to 2 decimal places) into Money
 * (integer paise). Uses round-half-up at the paise boundary.
 */
export function rupeesToMoney(rupees: number): Money {
  if (!Number.isFinite(rupees)) {
    throw new RangeError(`rupees must be a finite number, received: ${rupees}`);
  }
  // Multiplying a float by 100 introduces binary artifacts (e.g. 1.005 * 100 =
  // 100.4999999999). Normalise to 6 decimal places first so half-up rounding at
  // the paise boundary is deterministic, then round to the nearest paise.
  const paiseExact = Number((rupees * PAISE_PER_RUPEE).toFixed(6));
  return paise(Math.round(paiseExact));
}

/** Convert Money (integer paise) back into a rupee number with 2 decimals. */
export function moneyToRupees(amount: Money): number {
  return amount / PAISE_PER_RUPEE;
}

/** Format Money as an INR string, e.g. paise(123450) -> "₹1,234.50". */
export function formatMoney(amount: Money, locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(moneyToRupees(amount));
}

/** Add money amounts. */
export function addMoney(...amounts: Money[]): Money {
  return paise(amounts.reduce((sum, a) => sum + a, 0));
}

/** Subtract b from a; result may be negative (caller decides validity). */
export function subtractMoney(a: Money, b: Money): Money {
  return paise(a - b);
}

/**
 * Multiply money by a non-negative integer quantity. Kept integer-only so the
 * result is always exact paise.
 */
export function multiplyMoney(amount: Money, quantity: number): Money {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new RangeError(`quantity must be a non-negative integer, received: ${quantity}`);
  }
  return paise(amount * quantity);
}

/**
 * Apply a percentage (0..100) to a money amount, rounding half-up to paise.
 * Used by discount and tax calculations.
 */
export function percentOf(amount: Money, percent: number): Money {
  if (!Number.isFinite(percent) || percent < 0) {
    throw new RangeError(`percent must be a non-negative finite number, received: ${percent}`);
  }
  return paise(Math.round((amount * percent) / 100));
}

/** Clamp money to be at least zero. */
export function clampNonNegative(amount: Money): Money {
  return paise(Math.max(0, amount));
}

export const ZERO_MONEY: Money = paise(0);
