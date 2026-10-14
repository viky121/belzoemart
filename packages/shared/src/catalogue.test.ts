import fc from 'fast-check';
import { discountPct, slugify } from './catalogue';
import { paise } from './money';

describe('catalogue helpers — property-based', () => {
  it('PBT-04: slugify is idempotent', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        expect(slugify(slugify(s))).toBe(slugify(s));
      }),
    );
  });

  it('slug contains only lowercase alphanumerics and single hyphens', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        const slug = slugify(s);
        expect(slug).toMatch(/^[a-z0-9]*(-[a-z0-9]+)*$/);
      }),
    );
  });

  it('PBT-03: discountPct is always within [0,100]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (mrpV, spV) => {
          const d = discountPct(paise(mrpV), paise(spV));
          expect(d).toBeGreaterThanOrEqual(0);
          expect(d).toBeLessThanOrEqual(100);
        },
      ),
    );
  });

  it('discountPct is 0 when mrp is 0 or selling >= mrp', () => {
    expect(discountPct(paise(0), paise(0))).toBe(0);
    expect(discountPct(paise(1000), paise(1000))).toBe(0);
    expect(discountPct(paise(1000), paise(1500))).toBe(0);
    expect(discountPct(paise(1000), paise(750))).toBe(25);
  });
});
