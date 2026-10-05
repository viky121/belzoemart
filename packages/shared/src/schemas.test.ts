import fc from 'fast-check';
import {
  addressInputSchema,
  priceBreakupSchema,
  phoneSchema,
  pincodeSchema,
  homeSectionSchema,
  homeSectionsSchema,
  productQuerySchema,
} from './schemas';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';

/**
 * Property-based tests for shared schemas (PBT-02 round-trip via parse, PBT-07
 * domain generators). A valid domain object must survive a parse → serialize →
 * parse cycle unchanged.
 */

const validAddress = fc.record({
  label: fc.constantFrom('home', 'work', 'other'),
  fullName: fc.string({ minLength: 1, maxLength: 120 }).filter((s) => s.trim().length > 0),
  phone: fc
    .integer({ min: 6_000_000_000, max: 9_999_999_999 })
    .map((n) => String(n)),
  line1: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
  line2: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  city: fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0),
  state: fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0),
  pincode: fc.integer({ min: 100000, max: 999999 }).map((n) => String(n)),
});

describe('schemas — property-based', () => {
  it('PBT-02: address survives parse → JSON → parse round-trip', () => {
    fc.assert(
      fc.property(validAddress, (raw) => {
        const parsed = addressInputSchema.parse(raw);
        const roundTripped = addressInputSchema.parse(JSON.parse(JSON.stringify(parsed)));
        expect(roundTripped).toEqual(parsed);
      }),
    );
  });

  it('phone accepts valid Indian mobiles and rejects short numbers', () => {
    fc.assert(
      fc.property(fc.integer({ min: 6_000_000_000, max: 9_999_999_999 }), (n) => {
        expect(phoneSchema.safeParse(String(n)).success).toBe(true);
      }),
    );
    expect(phoneSchema.safeParse('12345').success).toBe(false);
    expect(phoneSchema.safeParse('5999999999').success).toBe(false); // cannot start with 5
  });

  it('pincode rejects values starting with 0', () => {
    expect(pincodeSchema.safeParse('012345').success).toBe(false);
    expect(pincodeSchema.safeParse('560001').success).toBe(true);
  });
});

describe('schemas — price breakup shape (example-based)', () => {
  it('accepts a well-formed breakup', () => {
    const ok = priceBreakupSchema.safeParse({
      subtotal: 100000,
      discount: 10000,
      shipping: 5000,
      codFee: 0,
      tax: 4500,
      gst: { cgst: 2250, sgst: 2250, igst: 0 },
      grandTotal: 99500,
    });
    expect(ok.success).toBe(true);
  });
});

describe('schemas — home sections (example-based)', () => {
  it('parses a valid section array across all source types', () => {
    const res = homeSectionsSchema.safeParse([
      { id: 's1', title: 'Deals', source: { type: 'sort', sort: 'discount' }, limit: 12, enabled: true },
      { id: 's2', title: 'Fresh', source: { type: 'category', categoryId: UUID } },
      { id: 's3', title: 'Picks', source: { type: 'manual', productIds: [UUID, UUID2] } },
    ]);
    expect(res.success).toBe(true);
  });

  it('applies defaults for omitted limit and enabled', () => {
    const res = homeSectionSchema.safeParse({
      id: 's1',
      title: 'Deals',
      source: { type: 'sort', sort: 'newest' },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.limit).toBe(12);
      expect(res.data.enabled).toBe(true);
    }
  });

  it('rejects an unknown sort value', () => {
    const res = homeSectionSchema.safeParse({
      id: 's1',
      title: 'Deals',
      source: { type: 'sort', sort: 'cheapest' },
    });
    expect(res.success).toBe(false);
  });

  it('rejects a non-uuid categoryId', () => {
    const res = homeSectionSchema.safeParse({
      id: 's1',
      title: 'Cat',
      source: { type: 'category', categoryId: 'not-a-uuid' },
    });
    expect(res.success).toBe(false);
  });

  it('rejects non-uuid manual productIds', () => {
    const res = homeSectionSchema.safeParse({
      id: 's1',
      title: 'Picks',
      source: { type: 'manual', productIds: ['nope'] },
    });
    expect(res.success).toBe(false);
  });

  it('rejects an empty manual productIds list (.min(1))', () => {
    const res = homeSectionSchema.safeParse({
      id: 's1',
      title: 'Picks',
      source: { type: 'manual', productIds: [] },
    });
    expect(res.success).toBe(false);
  });

  it('rejects more than 24 sections', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: `s${i}`,
      title: 'X',
      source: { type: 'sort' as const, sort: 'discount' as const },
    }));
    expect(homeSectionsSchema.safeParse(many).success).toBe(false);
  });
});

describe('schemas — productQuerySchema ids', () => {
  it('parses with no ids (original behaviour)', () => {
    const res = productQuerySchema.safeParse({});
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.ids).toBeUndefined();
  });

  it('parses with a comma-separated ids string kept as a string', () => {
    const res = productQuerySchema.safeParse({ ids: `${UUID},${UUID2}` });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.ids).toBe(`${UUID},${UUID2}`);
  });
});
