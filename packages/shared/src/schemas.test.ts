import fc from 'fast-check';
import {
  addressInputSchema,
  priceBreakupSchema,
  phoneSchema,
  pincodeSchema,
  homeSectionSchema,
  homeSectionsSchema,
  productQuerySchema,
  safeHrefSchema,
  promoContentSchema,
  homeBlockSchema,
  sanitizeHomeContent,
  mobileRefreshSchema,
  mobileLogoutSchema,
  mobileAuthResponseSchema,
  mobileRefreshResponseSchema,
  checkoutPreviewSchema,
  profilePatchSchema,
} from './schemas';
import { CLIENT_PLATFORM_HEADER, MOBILE_CLIENT_PLATFORM } from './constants';

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

describe('schemas — safeHrefSchema', () => {
  it('keeps app paths and absolute http(s) URLs', () => {
    expect(safeHrefSchema.parse('/search')).toBe('/search');
    expect(safeHrefSchema.parse('/category/grocery')).toBe('/category/grocery');
    expect(safeHrefSchema.parse('https://example.com/x')).toBe('https://example.com/x');
    expect(safeHrefSchema.parse('http://example.com')).toBe('http://example.com');
  });

  it('collapses protocol-relative, javascript:, data: and junk to "#"', () => {
    expect(safeHrefSchema.parse('//evil.com')).toBe('#');
    expect(safeHrefSchema.parse('javascript:alert(1)')).toBe('#');
    expect(safeHrefSchema.parse('data:text/html,<script>')).toBe('#');
    expect(safeHrefSchema.parse('not a url')).toBe('#');
    expect(safeHrefSchema.parse('')).toBe('#');
  });

  it('never throws on non-string input (catch fallback)', () => {
    expect(safeHrefSchema.parse(42 as unknown as string)).toBe('#');
    expect(safeHrefSchema.parse(null as unknown as string)).toBe('#');
  });
});

describe('schemas — promoContentSchema / homeBlockSchema', () => {
  it('applies promo defaults and degrades a bad href', () => {
    const res = promoContentSchema.safeParse({ title: 'Deals', href: 'javascript:void' });
    expect(res.success).toBe(true);
    if (res.success) {
 // "#" is how an unset picture/link is stored; promoImage() treats it as no picture.
      expect(res.data).toMatchObject({ cta: 'Shop Now', icon: '', imageUrl: '#', color: 'green', href: '#' });
    }
  });

  it('rejects a promo with no title', () => {
    expect(promoContentSchema.safeParse({ subtitle: 'x' }).success).toBe(false);
  });

  it('parses a banner block with defaults', () => {
    const res = homeBlockSchema.safeParse({ type: 'banner', id: 'b1' });
    expect(res.success).toBe(true);
    if (res.success && res.data.type === 'banner') {
      expect(res.data).toMatchObject({ title: '', text: '', ctaHref: '#', enabled: true });
    }
  });

  it('rejects a block missing its id', () => {
    expect(homeBlockSchema.safeParse({ type: 'banner' }).success).toBe(false);
  });

  it('rejects an unknown block type', () => {
    expect(homeBlockSchema.safeParse({ type: 'carousel', id: 'x' }).success).toBe(false);
  });
});

describe('schemas — sanitizeHomeContent', () => {
  it('returns null for junk / non-object input', () => {
    expect(sanitizeHomeContent(null)).toBeNull();
    expect(sanitizeHomeContent('nope')).toBeNull();
    expect(sanitizeHomeContent(42)).toBeNull();
  });

  it('drops malformed promos and keeps valid ones', () => {
    const res = sanitizeHomeContent({
      promos: [{ title: 'Good' }, { subtitle: 'no title' }, { title: 'Also good', color: 'pink' }],
    });
    expect(res?.promos).toHaveLength(2);
    expect(res?.promos?.[0]).toMatchObject({ title: 'Good' });
    expect(res?.promos?.[1]).toMatchObject({ title: 'Also good', color: 'pink' });
  });

  it('degrades a bad promo href to "#"', () => {
    const res = sanitizeHomeContent({ promos: [{ title: 'X', href: '//evil.com' }] });
    expect(res?.promos?.[0]?.href).toBe('#');
  });

  it('enforces caps (promos ≤ 12, blocks ≤ 10)', () => {
    const promos = Array.from({ length: 15 }, (_, i) => ({ title: `P${i}` }));
    const blocks = Array.from({ length: 11 }, (_, i) => ({ type: 'banner', id: `b${i}` }));
    const res = sanitizeHomeContent({ promos, blocks });
    expect(res?.promos).toHaveLength(12);
    expect(res?.blocks).toHaveLength(10);
  });

  it('drops a malformed card but keeps the rest of a cards block', () => {
    const res = sanitizeHomeContent({
      blocks: [
        {
          type: 'cards',
          id: 'c1',
          cards: [{ title: 'Keep me' }, { subtitle: 'no title' }, { title: 'Keep me too' }],
        },
      ],
    });
    expect(res?.blocks).toHaveLength(1);
    const block = res?.blocks?.[0];
    expect(block?.type).toBe('cards');
    if (block?.type === 'cards') {
      expect(block.cards).toHaveLength(2);
      expect(block.cards.map((c) => c.title)).toEqual(['Keep me', 'Keep me too']);
    }
  });

  it('keeps valid present hero fields and drops only an individually-invalid one', () => {
    const longAccent = 'x'.repeat(200); // over the max(120) cap → dropped
    const res = sanitizeHomeContent({
      hero: { eyebrow: 'Hi', accent: longAccent, ctaHref: '//evil' },
    });
    expect(res?.hero?.eyebrow).toBe('Hi');
    expect(res?.hero && 'accent' in res.hero).toBe(false);
    // safeHrefSchema never throws → the link survives as "#"
    expect(res?.hero?.ctaHref).toBe('#');
  });

  it('returns empty arrays (not defaults) so the web merge decides fallbacks', () => {
    const res = sanitizeHomeContent({});
    expect(res).toEqual({ promos: [], why: [], blocks: [] });
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

describe('schemas — mobile auth (A1)', () => {
  const customer = { id: 'c1', name: 'Asha', email: null, phone: '9876543210', locale: 'en' };

  it('exposes the client-platform header constants', () => {
    expect(CLIENT_PLATFORM_HEADER).toBe('x-client-platform');
    expect(MOBILE_CLIENT_PLATFORM).toBe('mobile');
  });

  it('mobileRefreshSchema accepts a token and rejects empty, oversized or missing', () => {
    expect(mobileRefreshSchema.safeParse({ refreshToken: 'rt' }).success).toBe(true);
    expect(mobileRefreshSchema.safeParse({ refreshToken: 'x'.repeat(512) }).success).toBe(true);
    expect(mobileRefreshSchema.safeParse({ refreshToken: '' }).success).toBe(false);
    expect(mobileRefreshSchema.safeParse({ refreshToken: 'x'.repeat(513) }).success).toBe(false);
    expect(mobileRefreshSchema.safeParse({}).success).toBe(false);
  });

  it('mobileLogoutSchema makes the token optional but still validates it', () => {
    expect(mobileLogoutSchema.safeParse({}).success).toBe(true);
    expect(mobileLogoutSchema.safeParse({ refreshToken: 'rt' }).success).toBe(true);
    expect(mobileLogoutSchema.safeParse({ refreshToken: '' }).success).toBe(false);
  });

  it('mobileAuthResponseSchema requires the customer; refresh response omits it', () => {
    const tokens = { accessToken: 'at', expiresIn: 900, refreshToken: 'rt' };
    expect(mobileAuthResponseSchema.safeParse({ ...tokens, customer }).success).toBe(true);
    expect(mobileAuthResponseSchema.safeParse(tokens).success).toBe(false);
    expect(mobileAuthResponseSchema.safeParse({ ...tokens, refreshToken: '', customer }).success).toBe(false);
    expect(mobileRefreshResponseSchema.safeParse(tokens).success).toBe(true);
    expect(mobileRefreshResponseSchema.safeParse({ ...tokens, expiresIn: 0 }).success).toBe(false);
  });
});

describe('schemas — checkoutPreviewSchema paymentMethod (A6)', () => {
  it('is optional and accepts known methods only', () => {
    expect(checkoutPreviewSchema.safeParse({ addressId: UUID }).success).toBe(true);
    expect(checkoutPreviewSchema.safeParse({ addressId: UUID, paymentMethod: 'cod' }).success).toBe(true);
    expect(checkoutPreviewSchema.safeParse({ addressId: UUID, paymentMethod: 'upi' }).success).toBe(true);
    expect(checkoutPreviewSchema.safeParse({ addressId: UUID, paymentMethod: 'bitcoin' }).success).toBe(false);
  });
});

describe('schemas — profilePatchSchema', () => {
  it('accepts a partial patch and trims fields', () => {
    const res = profilePatchSchema.safeParse({ name: '  Asha  ', locale: 'hi' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data).toEqual({ name: 'Asha', locale: 'hi' });
    expect(profilePatchSchema.safeParse({}).success).toBe(true);
  });

  it('accepts +91 / 91 / bare mobiles and rejects invalid values', () => {
    expect(profilePatchSchema.safeParse({ phone: '+919876543210' }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ phone: '919876543210' }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ phone: '9876543210' }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ phone: '5876543210' }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ name: '' }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ locale: 'fr' }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ dob: '2000-01-01' }).success).toBe(false);
  });
});
