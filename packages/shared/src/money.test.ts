import fc from 'fast-check';
import {
  addMoney,
  clampNonNegative,
  moneyToRupees,
  multiplyMoney,
  paise,
  percentOf,
  rupeesToMoney,
  subtractMoney,
  ZERO_MONEY,
} from './money';

/**
 * Property-based tests for money handling (PBT-02 round-trip, PBT-03 invariant).
 * Framework: fast-check (PBT-09). Shrinking + seeded reproducibility are enabled
 * by default; the seed is printed on failure.
 */

// Domain generator: integer paise within a realistic e-commerce range
// (0 .. ₹10,00,000 => 100,000,000 paise). Avoids meaningless huge values.
const moneyPaise = fc.integer({ min: 0, max: 100_000_000 }).map((n) => paise(n));

describe('money — property-based', () => {
  it('PBT-02: rupeesToMoney → moneyToRupees round-trips at 2-decimal precision', () => {
    fc.assert(
      fc.property(
        // rupee amounts with up to 2 decimals
        fc.integer({ min: 0, max: 100_000_000 }),
        (p) => {
          const rupees = p / 100;
          const back = rupeesToMoney(rupees);
          expect(back).toBe(paise(p));
          // and the rupee view of that money equals the original rupee value
          expect(moneyToRupees(back)).toBeCloseTo(rupees, 2);
        },
      ),
    );
  });

  it('PBT-03: addMoney is commutative', () => {
    fc.assert(
      fc.property(moneyPaise, moneyPaise, (a, b) => {
        expect(addMoney(a, b)).toBe(addMoney(b, a));
      }),
    );
  });

  it('PBT-03: adding ZERO_MONEY is identity', () => {
    fc.assert(
      fc.property(moneyPaise, (a) => {
        expect(addMoney(a, ZERO_MONEY)).toBe(a);
      }),
    );
  });

  it('PBT-03: subtract is the inverse of add', () => {
    fc.assert(
      fc.property(moneyPaise, moneyPaise, (a, b) => {
        expect(subtractMoney(addMoney(a, b), b)).toBe(a);
      }),
    );
  });

  it('PBT-03: multiplyMoney equals repeated addition', () => {
    fc.assert(
      fc.property(moneyPaise, fc.integer({ min: 0, max: 50 }), (a, q) => {
        let sum = ZERO_MONEY;
        for (let i = 0; i < q; i++) sum = addMoney(sum, a);
        expect(multiplyMoney(a, q)).toBe(sum);
      }),
    );
  });

  it('PBT-03: percentOf never exceeds the base amount for percent in [0,100]', () => {
    fc.assert(
      fc.property(moneyPaise, fc.integer({ min: 0, max: 100 }), (a, pct) => {
        const part = percentOf(a, pct);
        expect(part).toBeGreaterThanOrEqual(0);
        expect(part).toBeLessThanOrEqual(a);
      }),
    );
  });

  it('PBT-03: percentOf(x, 0) is zero and percentOf(x, 100) is x', () => {
    fc.assert(
      fc.property(moneyPaise, (a) => {
        expect(percentOf(a, 0)).toBe(ZERO_MONEY);
        expect(percentOf(a, 100)).toBe(a);
      }),
    );
  });

  it('PBT-03: clampNonNegative is idempotent and never negative', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100_000, max: 100_000 }).map((n) => paise(n)), (a) => {
        const once = clampNonNegative(a);
        const twice = clampNonNegative(once);
        expect(once).toBeGreaterThanOrEqual(0);
        expect(twice).toBe(once);
      }),
    );
  });
});

describe('money — example-based (pins concrete behavior, PBT-10)', () => {
  it('rounds half-up at the paise boundary', () => {
    expect(rupeesToMoney(1.005)).toBe(paise(101)); // 100.5 paise -> 101
    expect(rupeesToMoney(1.004)).toBe(paise(100));
  });

  it('multiplyMoney rejects negative or non-integer quantity', () => {
    expect(() => multiplyMoney(paise(100), -1)).toThrow(RangeError);
    expect(() => multiplyMoney(paise(100), 1.5)).toThrow(RangeError);
  });

  it('paise rejects non-integer input', () => {
    expect(() => paise(1.5)).toThrow(RangeError);
  });
});
