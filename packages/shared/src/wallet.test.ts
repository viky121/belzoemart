import fc from 'fast-check';
import { applyEntry, canRedeem, InsufficientBalanceError, runningBalance, type WalletDelta } from './wallet';

/**
 * Property-based tests for the wallet ledger (BR-4, BR-5, BR-6).
 */
const delta: fc.Arbitrary<WalletDelta> = fc.oneof(
  fc.record({ kind: fc.constant('earn' as const), amount: fc.integer({ min: 0, max: 100_000 }), ref: fc.string({ minLength: 1, maxLength: 8 }) }),
  fc.record({ kind: fc.constant('redeem' as const), amount: fc.integer({ min: 0, max: 100_000 }), ref: fc.string({ minLength: 1, maxLength: 8 }) }),
);

describe('wallet ledger — property-based', () => {
  it('PBT-06: balance never goes negative across any earn/redeem sequence', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500_000 }), fc.array(delta, { maxLength: 40 }), (start, deltas) => {
        let balance = start;
        const seen = new Set<string>();
        for (const d of deltas) {
          const key = `${d.kind}:${d.ref}`;
          if (seen.has(key)) continue; // idempotent by ref
          try {
            balance = applyEntry(balance, d);
            seen.add(key);
          } catch (e) {
            if (!(e instanceof InsufficientBalanceError)) throw e;
          }
          expect(balance).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it('PBT-03: redeem throws (no change) when amount exceeds balance', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 1, max: 100_000 }), (balance, extra) => {
        expect(() => applyEntry(balance, { kind: 'redeem', amount: balance + extra, ref: 'r' })).toThrow(
          InsufficientBalanceError,
        );
      }),
    );
  });

  it('PBT-03: ledger balanceAfter never negative and matches a re-derived running balance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.array(fc.integer({ min: -1000, max: 1000 }), { maxLength: 30 }),
        (opening, signedDeltas) => {
          const entries = runningBalance(opening, signedDeltas);
          // Re-derive with the same skip-if-negative rule.
          let balance = opening;
          entries.forEach((e, i) => {
            const next = balance + signedDeltas[i]!;
            if (next >= 0) balance = next;
            expect(e.balanceAfter).toBe(balance);
            expect(e.balanceAfter).toBeGreaterThanOrEqual(0);
          });
        },
      ),
    );
  });

  it('canRedeem matches balance >= amount', () => {
    expect(canRedeem(100, 100)).toBe(true);
    expect(canRedeem(100, 101)).toBe(false);
    expect(canRedeem(0, 0)).toBe(true);
  });
});
