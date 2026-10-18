import { resolveHomeLayout } from '@belzo/shared';
import {
  addSection,
  canRemove,
  designPayload,
  isDirty,
  isOn,
  itemInfo,
  moveSection,
  removeSection,
  setOn,
  validateDesign,
  type DesignState,
} from './home-design';

let n = 0;
const newId = () => `id-${++n}`;

function base(): DesignState {
  const productSections = [
    { id: 's1', title: 'Deals', source: { type: 'sort' as const, sort: 'discount' as const }, limit: 12, enabled: true },
    { id: 's2', title: 'Best Sellers', source: { type: 'sort' as const, sort: 'popularity' as const }, limit: 10, enabled: true },
  ];
  const offerRows = [
    {
      id: 'o1',
      title: 'Festive',
      columns: 2 as const,
      position: 'after_hero' as const,
      enabled: true,
      banners: [{ id: 'b1', imageUrl: '/a.jpg', linkUrl: '#', title: '', enabled: true }],
    },
  ];
  const blocks = [{ type: 'cards' as const, id: 'k1', title: 'Info', cards: [], enabled: true }];
  const promos = [{ title: 'Promo', subtitle: '', cta: 'Go', href: '/', icon: '', imageUrl: '', color: 'green' as const }];
  const why = [{ icon: '⭐', title: 'Fast', sub: '' }];
  const layout = resolveHomeLayout(null, { offerRows, sections: productSections, blocks });
  return { layout, productSections, offerRows, blocks, promos, why };
}

const ids = (s: DesignState) => s.layout.map((i) => i.id);

describe('moveSection', () => {
  it('reorders the page and leaves the content alone', () => {
    const s = base();
    const first = ids(s)[0];
    const moved = moveSection(s, 0, 3);
    expect(ids(moved)[3]).toBe(first);
    expect(moved.productSections).toBe(s.productSections);
    expect(ids(moved).length).toBe(ids(s).length);
  });

  it('is a no-op when nothing moves', () => {
    const s = base();
    expect(moveSection(s, 2, 2)).toBe(s);
  });
});

describe('setOn / isOn', () => {
  it('switches a built-in section through the layout', () => {
    const s = setOn(base(), 'promos', false);
    expect(isOn(s, s.layout.find((i) => i.id === 'promos')!)).toBe(false);
    expect(s.layout.find((i) => i.id === 'promos')!.enabled).toBe(false);
  });

  it('switches an added section through its own content (shared with the app)', () => {
    let s = setOn(base(), 'offers:o1', false);
    expect(s.offerRows[0]!.enabled).toBe(false);
    s = setOn(s, 'products:s2', false);
    expect(s.productSections[1]!.enabled).toBe(false);
    s = setOn(s, 'block:k1', false);
    expect(s.blocks[0]!.enabled).toBe(false);
    for (const id of ['offers:o1', 'products:s2', 'block:k1']) {
      expect(isOn(s, s.layout.find((i) => i.id === id)!)).toBe(false);
    }
    s = setOn(s, 'offers:o1', true);
    expect(s.offerRows[0]!.enabled).toBe(true);
  });

  it('ignores an unknown id', () => {
    const s = base();
    expect(setOn(s, 'nope', false)).toBe(s);
  });
});

describe('addSection', () => {
  it('adds each kind at the end, with a matching layout entry', () => {
    let s = base();
    for (const kind of ['products', 'offers', 'banner', 'cards'] as const) {
      const r = addSection(s, kind, newId);
      if ('error' in r) throw new Error(r.error);
      s = r.state;
      expect(s.layout[s.layout.length - 1]!.id).toBe(r.id);
    }
    expect(s.productSections).toHaveLength(3);
    expect(s.offerRows).toHaveLength(2);
    expect(s.blocks.map((b) => b.type)).toEqual(['cards', 'banner', 'cards']);
    // every layout entry points at content that exists
    const resolved = resolveHomeLayout(s.layout, { offerRows: s.offerRows, sections: s.productSections, blocks: s.blocks });
    expect(resolved.map((i) => i.id)).toEqual(s.layout.map((i) => i.id));
  });

  it('new sections start switched on and valid enough to edit', () => {
    const r = addSection(base(), 'products', newId);
    if ('error' in r) throw new Error(r.error);
    expect(r.state.productSections.at(-1)).toMatchObject({ enabled: true, limit: 12 });
  });

  it('refuses to exceed the limits', () => {
    let s = base();
    for (let i = 0; i < 9; i++) {
      // the page starts with 1 block, so 9 more reach the limit of 10
      const r = addSection(s, 'banner', newId);
      if ('error' in r) throw new Error(r.error);
      s = r.state;
    }
    const full = addSection(s, 'banner', newId);
    expect('error' in full).toBe(true);
  });
});

describe('removeSection / canRemove', () => {
  it('removes an added section and its content', () => {
    const s = removeSection(base(), 'offers:o1');
    expect(s.offerRows).toEqual([]);
    expect(ids(s)).not.toContain('offers:o1');
  });

  it('built-in sections can only be switched off', () => {
    const s = base();
    for (const id of ['hero', 'categories', 'promos', 'brands', 'why']) {
      expect(canRemove(s, s.layout.find((i) => i.id === id)!)).toBe(false);
      expect(removeSection(s, id)).toBe(s);
    }
  });

  it('keeps the last product section (none saved would bring the defaults back)', () => {
    let s = removeSection(base(), 'products:s1');
    expect(s.productSections).toHaveLength(1);
    const last = s.layout.find((i) => i.id === 'products:s2')!;
    expect(canRemove(s, last)).toBe(false);
    s = removeSection(s, 'products:s2');
    expect(s.productSections).toHaveLength(1);
  });
});

describe('itemInfo', () => {
  it('describes sections in plain words', () => {
    const s = base();
    const info = (id: string) => itemInfo(s, s.layout.find((i) => i.id === id)!);
    expect(info('products:s1')).toMatchObject({ title: 'Deals', subtitle: 'biggest discount · up to 12' });
    expect(info('offers:o1')).toMatchObject({ title: 'Festive', subtitle: '1 banner · 2 per line' });
    expect(info('block:k1')).toMatchObject({ title: 'Info', subtitle: '0 cards' });
    expect(info('promos').subtitle).toBe('1 tile');
    expect(info('why').subtitle).toBe('1 point');
    expect(info('hero').title).toBe('Main banner');
  });
});

describe('validateDesign', () => {
  it('accepts a good design', () => {
    expect(validateDesign(base())).toBeNull();
  });

  it('asks for an image on every offer banner', () => {
    const s = base();
    s.offerRows[0]!.banners[0]!.imageUrl = '';
    expect(validateDesign(s)).toMatch(/Offer banners “Festive”: every banner needs an image/);
  });

  it('asks for a category when a section is "from a category" but none is chosen', () => {
    const s = base();
    s.productSections[0] = { ...s.productSections[0]!, source: { type: 'category', categoryId: '' } };
    expect(validateDesign(s)).toMatch(/choose a category|categoryId|Invalid/i);
  });

  it('needs a title on promo tiles and at least one tile and one point', () => {
    const s = base();
    s.promos[0] = { ...s.promos[0]!, title: '' };
    expect(validateDesign(s)).toMatch(/Promo tile/);
    expect(validateDesign({ ...base(), promos: [] })).toMatch(/at least one promo tile/);
    expect(validateDesign({ ...base(), why: [] })).toMatch(/at least one/);
  });
});

describe('isDirty / designPayload', () => {
  it('detects a change and not a copy', () => {
    const a = base();
    expect(isDirty(a, designPayload(a))).toBe(false);
    expect(isDirty(a, moveSection(a, 0, 2))).toBe(true);
    expect(isDirty(null, a)).toBe(true);
  });
});
