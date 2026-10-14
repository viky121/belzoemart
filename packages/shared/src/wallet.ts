/**
 * Pure wallet ledger logic (BR-4, BR-5, BR-6). Amounts are integer paise.
 * Balance is never negative; redeem is guarded. Idempotency-by-ref is handled
 * by the persistence layer (unique ref); these functions are the money math.
 */

export interface WalletDelta {
  kind: 'earn' | 'redeem';
  amount: number; // paise, >= 0
  ref: string;
}

export class InsufficientBalanceError extends Error {
  constructor() {
    super('Insufficient wallet balance');
    this.name = 'InsufficientBalanceError';
  }
}

/** Apply a single earn/redeem to a balance, returning the new balance. */
export function applyEntry(balance: number, delta: WalletDelta): number {
  if (!Number.isInteger(delta.amount) || delta.amount < 0) {
    throw new RangeError('amount must be a non-negative integer');
  }
  if (delta.kind === 'earn') return balance + delta.amount;
  if (balance < delta.amount) throw new InsufficientBalanceError();
  return balance - delta.amount;
}

/** True iff a redeem of `amount` is allowed against `balance`. */
export function canRedeem(balance: number, amount: number): boolean {
  return balance >= amount;
}

/**
 * Compute a ledger from an opening balance and a series of signed deltas
 * (positive = credit, negative = debit). Debits that would drive the balance
 * negative are skipped (balanceAfter unchanged for that step). Returns one
 * entry per input delta with the resulting balanceAfter.
 */
export function runningBalance(
  opening: number,
  signedDeltas: number[],
): { delta: number; balanceAfter: number }[] {
  let balance = opening;
  return signedDeltas.map((delta) => {
    const next = balance + delta;
    if (next >= 0) balance = next;
    return { delta, balanceAfter: balance };
  });
}
