import type { CategoryNodeDto } from './catalogue';
import {
  DEFAULT_MOBILE_HOME,
  DEFAULT_MOBILE_MENU,
  activeBanners,
  menuAddressLines,
  menuTelHref,
  mobileHomeSchema,
  mobileMenuSchema,
  offerRowsAt,
  resolveMobileCategories,
  sanitizeMobileHome,
  sanitizeMobileMenu,
} from './mobile-home';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const node = (id: string, name: string, imageUrl: string | null = null): CategoryNodeDto => ({
  id,
  name,
  slug: name.toLowerCase(),
  imageUrl,
  children: [],
});

describe('sanitizeMobileHome', () => {
  it('returns complete defaults for null / garbage', () => {
    expect(sanitizeMobileHome(null)).toEqual(DEFAULT_MOBILE_HOME);
    expect(sanitizeMobileHome('nope')).toEqual(DEFAULT_MOBILE_HOME);
    expect(sanitizeMobileHome([])).toEqual(DEFAULT_MOBILE_HOME);
  });

  it('drops only the bad banner and keeps the rest of the config', () => {
    const out = sanitizeMobileHome({
      heroBanners: [
        { id: 'ok', imageUrl: '/api/uploads/banners/a.jpg', linkUrl: '/category/grocery' },
        { id: 'noimg', imageUrl: '' },
        { id: 'badhref', imageUrl: 'https://x.test/a.png', linkUrl: 'javascript:alert(1)' },
      ],
      dealsEnabled: false,
    });
    expect(out.heroBanners.map((b) => b.id)).toEqual(['ok', 'badhref']);
    // Unsafe link degrades to '#', never kept.
    expect(out.heroBanners[1]?.linkUrl).toBe('#');
    expect(out.dealsEnabled).toBe(false);
  });

  it('keeps an offer row when one of its banners is invalid', () => {
    const out = sanitizeMobileHome({
      offerRows: [
        {
          id: 'r1',
          columns: 3,
          banners: [
            { id: 'b1', imageUrl: '/a.png' },
            { id: 'b2', imageUrl: '#' },
            { id: 'b3', imageUrl: 'https://cdn.test/c.png', linkUrl: '/search' },
          ],
        },
      ],
    });
    expect(out.offerRows).toHaveLength(1);
    expect(out.offerRows[0]?.columns).toBe(3);
    expect(out.offerRows[0]?.banners.map((b) => b.id)).toEqual(['b1', 'b3']);
  });

  it('drops a row with an invalid column count or position', () => {
    const out = sanitizeMobileHome({
      offerRows: [
        { id: 'x', columns: 5, banners: [] },
        { id: 'y', columns: 2, position: 'somewhere', banners: [] },
        { id: 'z', columns: 2, banners: [] },
      ],
    });
    expect(out.offerRows.map((r) => r.id)).toEqual(['z']);
  });

  it('falls back to the default deals title when blank', () => {
    expect(sanitizeMobileHome({ dealsTitle: '   ' }).dealsTitle).toBe('Deals of the Day');
    expect(sanitizeMobileHome({ dealsTitle: 'Hot Deals' }).dealsTitle).toBe('Hot Deals');
  });

  it('caps array sizes', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `b${i}`, imageUrl: '/a.png' }));
    expect(sanitizeMobileHome({ heroBanners: many }).heroBanners).toHaveLength(10);
  });
});

describe('mobileHomeSchema (strict, used by the admin save)', () => {
  it('rejects a banner without an image', () => {
    const r = mobileHomeSchema.safeParse({ heroBanners: [{ id: 'a', imageUrl: '' }] });
    expect(r.success).toBe(false);
  });
  it('rejects 4 columns and accepts 1, 2, 3', () => {
    const row = (columns: number) =>
      mobileHomeSchema.safeParse({ offerRows: [{ id: 'r', columns, banners: [] }] }).success;
    expect([row(1), row(2), row(3), row(4), row(0)]).toEqual([true, true, true, false, false]);
  });
  it('applies defaults to an empty object', () => {
    expect(mobileHomeSchema.parse({})).toEqual(DEFAULT_MOBILE_HOME);
  });
});

describe('activeBanners / offerRowsAt', () => {
  const rows = sanitizeMobileHome({
    offerRows: [
      { id: 'top', position: 'after_hero', columns: 2, banners: [{ id: '1', imageUrl: '/a.png' }] },
      { id: 'off', position: 'after_hero', enabled: false, banners: [{ id: '2', imageUrl: '/a.png' }] },
      { id: 'empty', position: 'after_hero', banners: [{ id: '3', imageUrl: '/a.png', enabled: false }] },
      { id: 'low', position: 'after_deals', columns: 3, banners: [{ id: '4', imageUrl: '/a.png' }] },
    ],
  }).offerRows;

  it('filters by position, enabled flags and empty rows', () => {
    expect(offerRowsAt(rows, 'after_hero').map((r) => r.id)).toEqual(['top']);
    expect(offerRowsAt(rows, 'after_deals').map((r) => r.id)).toEqual(['low']);
    expect(offerRowsAt(rows, 'after_categories')).toEqual([]);
  });
  it('activeBanners drops disabled ones', () => {
    const b = sanitizeMobileHome({
      heroBanners: [
        { id: 'a', imageUrl: '/a.png' },
        { id: 'b', imageUrl: '/b.png', enabled: false },
      ],
    }).heroBanners;
    expect(activeBanners(b).map((x) => x.id)).toEqual(['a']);
  });
});

describe('resolveMobileCategories', () => {
  const tree = [node(A, 'Home Care'), node(B, 'Grocery', '/g.png'), node(C, 'Baby Care')];

  it('keeps tree order when there are no overrides and uses the category image', () => {
    const t = resolveMobileCategories(tree, []);
    expect(t.map((x) => x.name)).toEqual(['Home Care', 'Grocery', 'Baby Care']);
    expect(t[1]?.iconUrl).toBe('/g.png');
    expect(t[0]?.iconUrl).toBeNull();
  });

  it('orders overridden categories first, then appends new ones in tree order', () => {
    const t = resolveMobileCategories(tree, [
      { categoryId: C, name: '', iconUrl: '', hidden: false },
      { categoryId: B, name: '', iconUrl: '', hidden: false },
    ]);
    expect(t.map((x) => x.id)).toEqual([C, B, A]);
  });

  it('applies name + icon overrides and hides categories', () => {
    const t = resolveMobileCategories(tree, [
      { categoryId: B, name: 'Kirana', iconUrl: '/new.png', hidden: false },
      { categoryId: A, name: '', iconUrl: '', hidden: true },
    ]);
    expect(t.map((x) => x.name)).toEqual(['Kirana', 'Baby Care']);
    expect(t[0]?.iconUrl).toBe('/new.png');
  });

  it('ignores overrides for deleted categories and duplicates', () => {
    const t = resolveMobileCategories(tree, [
      { categoryId: '99999999-9999-4999-8999-999999999999', name: 'Ghost', iconUrl: '', hidden: false },
      { categoryId: A, name: 'One', iconUrl: '', hidden: false },
      { categoryId: A, name: 'Dup', iconUrl: '', hidden: false },
    ]);
    expect(t.map((x) => x.name)).toEqual(['One', 'Grocery', 'Baby Care']);
  });
});

describe('☰ menu config', () => {
  it('an old config without a menu block gets the supplied defaults', () => {
    const home = sanitizeMobileHome({ dealsEnabled: false });
    expect(home.menu).toEqual(DEFAULT_MOBILE_MENU);
    expect(home.menu.carePhone).toBe('8839095625');
  });

  it('keeps an admin-cleared field empty so the menu item hides', () => {
    const menu = sanitizeMobileMenu({ carePhone: '', careWhatsappUrl: '' });
    expect(menu.carePhone).toBe('');
    expect(menu.careWhatsappUrl).toBe('');
    expect(menu.careEmail).toBe(DEFAULT_MOBILE_MENU.careEmail);
  });

  it('falls back to the default for a malformed field and keeps the rest', () => {
    const menu = sanitizeMobileMenu({
      careWhatsappUrl: 'javascript:alert(1)',
      storeMapsUrl: 'http://insecure',
      careEmail: 'bad',
      carePhone: '9999999999',
    });
    expect(menu.careWhatsappUrl).toBe(DEFAULT_MOBILE_MENU.careWhatsappUrl);
    expect(menu.storeMapsUrl).toBe(DEFAULT_MOBILE_MENU.storeMapsUrl);
    expect(menu.careEmail).toBe(DEFAULT_MOBILE_MENU.careEmail);
    expect(menu.carePhone).toBe('9999999999');
  });

  it('the strict schema rejects a non-https link and a bad email', () => {
    expect(mobileMenuSchema.safeParse({ ...DEFAULT_MOBILE_MENU, website: 'http://x.com' }).success).toBe(false);
    expect(mobileMenuSchema.safeParse({ ...DEFAULT_MOBILE_MENU, careEmail: 'nope' }).success).toBe(false);
    expect(
      mobileMenuSchema.safeParse({
        ...DEFAULT_MOBILE_MENU,
        playStoreUrl: 'https://play.google.com/store/apps/details?id=in.belzo.emart',
      }).success,
    ).toBe(true);
  });

  it('splits the address into rows and builds a tel: link', () => {
    expect(menuAddressLines('A\n\n B \r\nC')).toEqual(['A', 'B', 'C']);
    expect(menuTelHref('88390 95625')).toBe('tel:8839095625');
    expect(menuTelHref('')).toBeNull();
  });
});
