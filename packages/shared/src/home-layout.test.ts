import {
  defaultHomeLayout,
  moveLayoutItem,
  resolveHomeLayout,
  sanitizeHomeLayout,
  visibleHomeLayout,
  type HomeLayoutContent,
} from './home-layout';

const content: HomeLayoutContent = {
  offerRows: [
    { id: 'o-hero', position: 'after_hero', enabled: true },
    { id: 'o-cats', position: 'after_categories', enabled: true },
    { id: 'o-deals', position: 'after_deals', enabled: true },
  ],
  sections: [
    { id: 's-deals', enabled: true },
    { id: 's-best', enabled: true },
  ],
  blocks: [{ id: 'b-1', enabled: true }],
};

const ids = (l: { id: string }[]) => l.map((i) => i.id);

describe('defaultHomeLayout', () => {
  it('reproduces the order the home page has always had', () => {
    expect(ids(defaultHomeLayout(content))).toEqual([
      'hero',
      'offers:o-hero',
      'categories',
      'offers:o-cats',
      'promos',
      'block:b-1',
      'products:s-deals',
      'products:s-best',
      'offers:o-deals',
      'brands',
      'why',
    ]);
  });

  it('with no content, is just the built-in sections', () => {
    expect(ids(defaultHomeLayout({ offerRows: [], sections: [], blocks: [] }))).toEqual([
      'hero',
      'categories',
      'promos',
      'brands',
      'why',
    ]);
  });
});

describe('sanitizeHomeLayout', () => {
  it('drops malformed items, repeatables without a refId and duplicates', () => {
    const out = sanitizeHomeLayout([
      { id: 'x', kind: 'hero', enabled: true },
      { id: 'hero', kind: 'hero', enabled: false }, // duplicate of the first (same canonical id)
      { id: 'products:a', kind: 'products' }, // repeatable with no refId
      { id: 'nope', kind: 'unknown' },
      'junk',
      null,
      { id: 'p', kind: 'products', refId: 'a' },
    ]);
    expect(ids(out)).toEqual(['hero', 'products:a']);
    expect(out[0]!.enabled).toBe(true);
  });

  it('forces the canonical id so a hand-edited id cannot collide', () => {
    const out = sanitizeHomeLayout([{ id: 'whatever', kind: 'offers', refId: 'r1' }]);
    expect(out[0]!.id).toBe('offers:r1');
  });

  it('is empty for non-arrays', () => {
    expect(sanitizeHomeLayout(undefined)).toEqual([]);
    expect(sanitizeHomeLayout({})).toEqual([]);
  });
});

describe('resolveHomeLayout', () => {
  it('uses the default order when nothing is saved', () => {
    expect(ids(resolveHomeLayout(null, content))).toEqual(ids(defaultHomeLayout(content)));
  });

  it('follows a saved order', () => {
    const saved = [
      { id: 'categories', kind: 'categories', enabled: true },
      { id: 'hero', kind: 'hero', enabled: true },
      { id: 'products:s-best', kind: 'products', refId: 's-best', enabled: true },
    ];
    const out = resolveHomeLayout(saved, content);
    expect(ids(out).slice(0, 3)).toEqual(['categories', 'hero', 'products:s-best']);
  });

  it('drops sections whose content is gone', () => {
    const saved = [
      { id: 'hero', kind: 'hero', enabled: true },
      { id: 'products:deleted', kind: 'products', refId: 'deleted', enabled: true },
    ];
    expect(ids(resolveHomeLayout(saved, content))).not.toContain('products:deleted');
  });

  it('adds content that is not in the saved layout next to sections of its kind', () => {
    const saved = [
      { id: 'hero', kind: 'hero', enabled: true },
      { id: 'products:s-deals', kind: 'products', refId: 's-deals', enabled: true },
      { id: 'categories', kind: 'categories', enabled: true },
    ];
    const withNew: HomeLayoutContent = { ...content, sections: [...content.sections, { id: 's-new', enabled: true }] };
    const out = ids(resolveHomeLayout(saved, withNew));
    // s-best and s-new were both missing: they join the product group right after s-deals, in order,
    // and nothing else is pushed between them.
    const at = out.indexOf('products:s-deals');
    expect(out.slice(at, at + 3)).toEqual(['products:s-deals', 'products:s-best', 'products:s-new']);
  });

  it('puts a missing built-in section back at the end rather than losing it', () => {
    const out = ids(resolveHomeLayout([{ id: 'hero', kind: 'hero', enabled: true }], content));
    expect(out).toEqual(expect.arrayContaining(['categories', 'promos', 'brands', 'why']));
    expect(new Set(out).size).toBe(out.length);
  });

  it('a repeatable is on or off by its own content flag, a built-in by the layout', () => {
    const c: HomeLayoutContent = { ...content, sections: [{ id: 's-deals', enabled: false }, { id: 's-best', enabled: true }] };
    const saved = [
      { id: 'products:s-deals', kind: 'products', refId: 's-deals', enabled: true }, // layout says on, content says off
      { id: 'products:s-best', kind: 'products', refId: 's-best', enabled: false }, // layout says off, content says on
      { id: 'promos', kind: 'promos', enabled: false },
    ];
    const out = resolveHomeLayout(saved, c);
    const by = Object.fromEntries(out.map((i) => [i.id, i.enabled]));
    expect(by['products:s-deals']).toBe(false);
    expect(by['products:s-best']).toBe(true);
    expect(by['promos']).toBe(false);
  });
});

describe('visibleHomeLayout', () => {
  it('leaves out switched-off sections and keeps the order', () => {
    const c: HomeLayoutContent = { ...content, blocks: [{ id: 'b-1', enabled: false }] };
    const saved = [
      { id: 'hero', kind: 'hero', enabled: true },
      { id: 'promos', kind: 'promos', enabled: false },
      { id: 'block:b-1', kind: 'block', refId: 'b-1', enabled: true },
      { id: 'brands', kind: 'brands', enabled: true },
    ];
    const out = ids(visibleHomeLayout(saved, c));
    expect(out).not.toContain('promos');
    expect(out).not.toContain('block:b-1');
    expect(out.indexOf('hero')).toBeLessThan(out.indexOf('brands'));
  });
});

describe('moveLayoutItem', () => {
  it('moves an item to a new position', () => {
    expect(moveLayoutItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveLayoutItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('clamps, ignores no-ops, and never mutates', () => {
    const list = ['a', 'b', 'c'];
    expect(moveLayoutItem(list, 0, 99)).toEqual(['b', 'c', 'a']);
    expect(moveLayoutItem(list, 2, -5)).toEqual(['c', 'a', 'b']);
    expect(moveLayoutItem(list, 1, 1)).toBe(list);
    expect(moveLayoutItem(list, 9, 0)).toBe(list);
    expect(list).toEqual(['a', 'b', 'c']);
  });
});
