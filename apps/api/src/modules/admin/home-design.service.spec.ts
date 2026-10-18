import { DEFAULT_SECTIONS, MOBILE_HOME_KEY } from '@belzo/shared';
import { homeDesignInputSchema, HomeDesignService, HOME_LAYOUT_KEY, type HomeDesignInput } from './home-design.service';
import { PublicSettingsController } from './public-settings.controller';
import type { SettingsService } from './settings.service';

function fake(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  const set = jest.fn(async (_actor: string, key: string, value: unknown) => {
    store[key] = value;
  });
  const svc = { get: async (k: string) => store[k] ?? null, set } as unknown as SettingsService;
  return { svc, store, set };
}

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: '',
  columns: 2,
  position: 'after_categories',
  enabled: true,
  banners: [{ id: `${id}-b1`, imageUrl: '/api/uploads/banners/a.jpg', linkUrl: '/category/x', title: '', enabled: true }],
  ...over,
});

function input(over: Partial<HomeDesignInput> = {}): HomeDesignInput {
  return homeDesignInputSchema.parse({
    layout: [],
    productSections: [{ id: 'sec1', title: 'Hot', source: { type: 'sort', sort: 'discount' }, limit: 8, enabled: true }],
    offerRows: [],
    blocks: [],
    promos: [{ title: 'Promo' }],
    why: [{ title: 'Why' }],
    ...over,
  });
}

describe('HomeDesignService.get', () => {
  it('with nothing saved, shows today\'s home: default sections, default tiles, default order', async () => {
    const d = await new HomeDesignService(fake().svc).get();
    expect(d.theme).toBe('classic');
    expect(d.productSections.map((s) => s.id)).toEqual(DEFAULT_SECTIONS.map((s) => s.id));
    expect(d.promos.length).toBeGreaterThan(0);
    expect(d.layout.map((i) => i.id)).toEqual(
      expect.arrayContaining(['hero', 'categories', 'promos', 'brands', 'why', 'products:default-deals']),
    );
    expect(d.layout[0]!.id).toBe('hero');
  });

  it('reads the active theme\'s content and the app\'s offer rows', async () => {
    const { svc } = fake({
      theme: 'emart',
      home_content: { promos: [{ title: 'eMart tile' }], blocks: [{ type: 'banner', id: 'blk', title: 'Hi' }] },
      'home_content.classic': { promos: [{ title: 'Classic tile' }] },
      [MOBILE_HOME_KEY]: { offerRows: [row('r1', { position: 'after_hero' })] },
    });
    const d = await new HomeDesignService(svc).get();
    expect(d.theme).toBe('emart');
    expect(d.promos[0]!.title).toBe('eMart tile');
    expect(d.blocks.map((b) => b.id)).toEqual(['blk']);
    expect(d.offerRows.map((r) => r.id)).toEqual(['r1']);
    expect(d.layout.map((i) => i.id)).toEqual(expect.arrayContaining(['offers:r1', 'block:blk']));
  });
});

describe('HomeDesignService.put', () => {
  it('writes every store the website and app read, and returns the saved design', async () => {
    const { svc, store, set } = fake({
      theme: 'emart',
      home_content: { hero: { line1: 'Keep me' }, promos: [{ title: 'Old' }] },
      [MOBILE_HOME_KEY]: { dealsTitle: 'My Deals', festival: 'diwali', offerRows: [] },
    });
    const out = await new HomeDesignService(svc).put(
      'admin-1',
      input({
        layout: [
          { id: 'categories', kind: 'categories', enabled: true },
          { id: 'hero', kind: 'hero', enabled: false },
          { id: 'offers:r1', kind: 'offers', refId: 'r1', enabled: true },
          { id: 'products:sec1', kind: 'products', refId: 'sec1', enabled: true },
        ],
        offerRows: [row('r1') as never],
        promos: [{ title: 'New tile' } as never],
      }),
    );
    // every store was written by the acting admin
    const keys = set.mock.calls.map((c) => c[1]);
    expect(keys).toEqual(['home.sections', 'home_content', MOBILE_HOME_KEY, HOME_LAYOUT_KEY]);
    expect(set.mock.calls.every((c) => c[0] === 'admin-1')).toBe(true);
    // order + on/off of built-ins
    expect((store[HOME_LAYOUT_KEY] as { id: string }[]).slice(0, 2).map((i) => i.id)).toEqual(['categories', 'hero']);
    expect(out.layout.find((i) => i.id === 'hero')!.enabled).toBe(false);
    // the hero text and the rest of the app config are kept
    expect((store.home_content as { hero: { line1: string } }).hero.line1).toBe('Keep me');
    expect((store.home_content as { promos: { title: string }[] }).promos[0]!.title).toBe('New tile');
    expect(store[MOBILE_HOME_KEY]).toMatchObject({ dealsTitle: 'My Deals', festival: 'diwali' });
    expect((store[MOBILE_HOME_KEY] as { offerRows: { id: string }[] }).offerRows.map((r) => r.id)).toEqual(['r1']);
    expect(out.offerRows.map((r) => r.id)).toEqual(['r1']);
  });

  it('writes the classic theme\'s content under its own key', async () => {
    const { svc, store } = fake({ theme: 'classic' });
    await new HomeDesignService(svc).put('a', input());
    expect(store['home_content.classic']).toBeDefined();
    expect(store['home_content']).toBeUndefined();
  });

  it('a section added to the page is on or off through its own content, not the layout', async () => {
    const { svc, store } = fake();
    await new HomeDesignService(svc).put(
      'a',
      input({
        layout: [{ id: 'offers:r1', kind: 'offers', refId: 'r1', enabled: false }],
        offerRows: [row('r1', { enabled: false }) as never],
      }),
    );
    expect((store[HOME_LAYOUT_KEY] as { enabled: boolean }[])[0]!.enabled).toBe(true); // ignored for repeatables
    const d = await new HomeDesignService(svc).get();
    expect(d.layout.find((i) => i.id === 'offers:r1')!.enabled).toBe(false); // the row's own flag wins
  });

  it('what the website reads publicly matches what was saved', async () => {
    const { svc } = fake({ theme: 'emart' });
    await new HomeDesignService(svc).put(
      'a',
      input({ layout: [{ id: 'why', kind: 'why', enabled: true }, { id: 'hero', kind: 'hero', enabled: true }] }),
    );
    const pub = await new PublicSettingsController(svc).publicSettings();
    expect(pub.homeLayout.map((i) => i.id)).toEqual(['why', 'hero']);
  });
});

describe('homeDesignInputSchema', () => {
  const base = {
    layout: [],
    productSections: [],
    offerRows: [],
    blocks: [],
    promos: [{ title: 'p' }],
    why: [{ title: 'w' }],
  };

  it('rejects an offer banner with no image (the same rule as the app module)', () => {
    const bad = { ...base, offerRows: [row('r1', { banners: [{ id: 'b', imageUrl: '', linkUrl: '#', title: '', enabled: true }] })] };
    expect(homeDesignInputSchema.safeParse(bad).success).toBe(false);
  });

  it('needs at least one promo tile and one "why" item (an empty list would bring the defaults back)', () => {
    expect(homeDesignInputSchema.safeParse({ ...base, promos: [] }).success).toBe(false);
    expect(homeDesignInputSchema.safeParse({ ...base, why: [] }).success).toBe(false);
  });

  it('rejects an unknown section kind and an over-long layout', () => {
    expect(homeDesignInputSchema.safeParse({ ...base, layout: [{ id: 'x', kind: 'nope' }] }).success).toBe(false);
    const many = Array.from({ length: 61 }, (_, i) => ({ id: `products:${i}`, kind: 'products', refId: String(i) }));
    expect(homeDesignInputSchema.safeParse({ ...base, layout: many }).success).toBe(false);
  });
});
