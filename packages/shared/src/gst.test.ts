import fc from 'fast-check';
import {
  allocateProportional,
  amountInWordsInr,
  GST_STATES,
  gstStateCode,
  isValidGstin,
  panFromGstin,
} from './gst';

describe('amountInWordsInr', () => {
  it.each([
    [0, 'Rupees Zero Only'],
    [50, 'Rupees Zero and Fifty Paise Only'],
    [100, 'Rupees One Only'],
    [1100, 'Rupees Eleven Only'],
    [1900, 'Rupees Nineteen Only'],
    [2000, 'Rupees Twenty Only'],
    [2100, 'Rupees Twenty One Only'],
    [10_000, 'Rupees One Hundred Only'],
    [10_100, 'Rupees One Hundred One Only'],
    [1_006_740, 'Rupees Ten Thousand Sixty Seven and Forty Paise Only'],
    [1_00_000_00, 'Rupees One Lakh Only'],
    [12_34_567_89, 'Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Paise Only'],
    [1_00_00_000_00, 'Rupees One Crore Only'],
    [
      99_99_99_999_99,
      'Rupees Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine and Ninety Nine Paise Only',
    ],
    [100_00_00_000_00, 'Rupees One Hundred Crore Only'],
    [1_25_50_000_01, 'Rupees One Crore Twenty Five Lakh Fifty Thousand and One Paise Only'],
    [125_00_50_000_00, 'Rupees One Hundred Twenty Five Crore Fifty Thousand Only'],
  ])('%d paise -> %s', (amount, words) => {
    expect(amountInWordsInr(amount)).toBe(words);
  });

  it('rejects negative and non-integer amounts', () => {
    expect(() => amountInWordsInr(-1)).toThrow(RangeError);
    expect(() => amountInWordsInr(10.5)).toThrow(RangeError);
    expect(() => amountInWordsInr(Number.NaN)).toThrow(RangeError);
  });
});

describe('gstStateCode', () => {
  it.each([
    ['Karnataka', '29'],
    ['madhya pradesh', '23'],
    ['  DELHI ', '07'],
    ['New Delhi', '07'],
    ['Jammu & Kashmir', '01'],
    ['Orissa', '21'],
    ['Tamil Nadu', '33'],
    ['tamilnadu', '33'],
  ])('%s -> %s', (name, code) => {
    expect(gstStateCode(name)).toBe(code);
  });

  it('returns null for unknown or blank names', () => {
    expect(gstStateCode('Atlantis')).toBeNull();
    expect(gstStateCode('')).toBeNull();
    expect(gstStateCode('   ')).toBeNull();
    expect(gstStateCode(undefined)).toBeNull();
    expect(gstStateCode(null)).toBeNull();
  });

  it('round-trips every state in GST_STATES', () => {
    for (const s of GST_STATES) expect(gstStateCode(s.name)).toBe(s.code);
    expect(new Set(GST_STATES.map((s) => s.code)).size).toBe(GST_STATES.length);
  });
});

describe('GSTIN / PAN', () => {
  it('derives the PAN from a valid GSTIN', () => {
    expect(isValidGstin('29ABCDE1234F1Z5')).toBe(true);
    expect(panFromGstin('29ABCDE1234F1Z5')).toBe('ABCDE1234F');
    expect(panFromGstin(' 29abcde1234f1z5 ')).toBe('ABCDE1234F');
  });

  it('returns null for invalid or blank GSTINs', () => {
    expect(panFromGstin('GSTIN-UNSET')).toBeNull();
    expect(panFromGstin('29ABCDE1234F1X5')).toBeNull();
    expect(panFromGstin('')).toBeNull();
    expect(panFromGstin(null)).toBeNull();
    expect(isValidGstin(undefined)).toBe(false);
  });
});

describe('allocateProportional', () => {
  it('puts the remainder on the last positive-weight index', () => {
    expect(allocateProportional(10, [1, 1, 1])).toEqual([3, 3, 4]);
    expect(allocateProportional(10, [1, 1, 0])).toEqual([5, 5, 0]);
    expect(allocateProportional(7, [1, 1, 1, 0])).toEqual([2, 2, 3, 0]);
  });

  it('gives zero-weight entries nothing when another weight is positive', () => {
    expect(allocateProportional(999, [0, 5, 0])).toEqual([0, 999, 0]);
  });

  it('returns zeros for a zero total and puts everything last when all weights are zero', () => {
    expect(allocateProportional(0, [3, 4])).toEqual([0, 0]);
    expect(allocateProportional(5, [0, 0])).toEqual([0, 5]);
  });

  it('spills backwards when the last line is capped', () => {
    expect(allocateProportional(3, [1, 1, 1], [5, 5, 0])).toEqual([1, 2, 0]);
    expect(allocateProportional(5, [2, 2, 1], [2, 2, 1])).toEqual([2, 2, 1]);
  });

  it('rejects invalid input', () => {
    expect(() => allocateProportional(-1, [1])).toThrow(RangeError);
    expect(() => allocateProportional(1.5, [1])).toThrow(RangeError);
    expect(() => allocateProportional(1, [])).toThrow(RangeError);
    expect(() => allocateProportional(1, [1.5])).toThrow(RangeError);
    expect(() => allocateProportional(10, [1, 1], [2, 2])).toThrow(RangeError);
  });

  it('property: sums exactly to total, non-negative, respects caps', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 50_000_000 }), { minLength: 1, maxLength: 12 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (caps, seed) => {
          const capSum = caps.reduce((s, c) => s + c, 0);
          const total = capSum === 0 ? 0 : seed % (capSum + 1);
          // weights = caps (the invoice's discount use-case)
          const out = allocateProportional(total, caps, caps);
          expect(out.reduce((s, v) => s + v, 0)).toBe(total);
          out.forEach((v, i) => {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(caps[i]!);
          });
        },
      ),
    );
  });

  it('property: uncapped allocation sums exactly and zero weights get 0', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1_000_000_000 }), { minLength: 1, maxLength: 12 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        (weights, total) => {
          const out = allocateProportional(total, weights);
          expect(out.reduce((s, v) => s + v, 0)).toBe(total);
          expect(out.every((v) => v >= 0 && Number.isInteger(v))).toBe(true);
          if (weights.some((w) => w > 0)) {
            weights.forEach((w, i) => {
              if (w === 0) expect(out[i]).toBe(0);
            });
          }
        },
      ),
    );
  });
});
