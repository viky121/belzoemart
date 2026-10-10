import { categoryLabels, matchCategory, normCategoryKey, type CategoryRef } from './category-match';

/** Same fixture as the ProductService.bulkUpsert resolver specs. */
const cats: CategoryRef[] = [
  { id: 'cat-apparel', name: 'Apparel', slug: 'apparel' },
  { id: 'cat-tea', name: 'Tea & Coffee', slug: 'tea-and-coffee' },
  { id: 'cat-ghee-1', name: 'Ghee', slug: 'ghee' },
  { id: 'cat-ghee-2', name: 'Ghee', slug: 'ghee-2' },
];

describe('normCategoryKey', () => {
  it('folds case, punctuation and "&"/"and"', () => {
    expect(normCategoryKey('Tea & Coffee')).toBe('teacoffee');
    expect(normCategoryKey('tea-and-coffee')).toBe('teacoffee');
    expect(normCategoryKey('tea-coffee')).toBe('teacoffee');
  });
});

describe('matchCategory', () => {
  it('resolves near-miss slugs and names (tea-coffee / Tea & Coffee)', () => {
    expect(matchCategory('tea-coffee', cats)).toEqual({
      ok: { id: 'cat-tea', name: 'Tea & Coffee', slug: 'tea-and-coffee' },
    });
    expect(matchCategory('Tea & Coffee', cats)).toEqual({
      ok: { id: 'cat-tea', name: 'Tea & Coffee', slug: 'tea-and-coffee' },
    });
  });

  it('exact slug and lower-cased slug win', () => {
    expect(matchCategory('apparel', cats)).toMatchObject({ ok: { id: 'cat-apparel' } });
    expect(matchCategory('APPAREL', cats)).toMatchObject({ ok: { id: 'cat-apparel' } });
  });

  it('reports an ambiguous name with the exact slugs to choose from', () => {
    // No exact slug; the normalised name matches both "Ghee" categories.
    expect(matchCategory('GHEE!', cats)).toEqual({
      error: 'category "GHEE!" is ambiguous — use one of: ghee, ghee-2',
    });
    // 'GHEE ' lower-cases to the exact slug 'ghee' (the bulkUpsert fake has no such slug).
    expect(matchCategory('GHEE ', cats)).toMatchObject({ ok: { id: 'cat-ghee-1' } });
  });

  it('reports an unknown category with hints', () => {
    expect(matchCategory('nonexistent', cats)).toEqual({ error: 'unknown category "nonexistent"' });
    expect(matchCategory('appar', cats)).toEqual({
      error: 'unknown category "appar" — did you mean: apparel?',
    });
  });

  it('an inactive category matches by exact slug but not by name', () => {
    const withInactive: CategoryRef[] = [
      ...cats,
      { id: 'cat-old', name: 'Old Stock', slug: 'old-stock', isActive: false },
    ];
    expect(matchCategory('old-stock', withInactive)).toMatchObject({ ok: { id: 'cat-old' } });
    expect(matchCategory('Old Stock', withInactive)).toEqual({ error: 'unknown category "Old Stock"' });
  });
});

describe('categoryLabels', () => {
  it('uses the name when it resolves back to the category, else the slug', () => {
    const labels = categoryLabels([
      ...cats,
      { id: 'cat-old', name: 'Old Stock', slug: 'old-stock', isActive: false },
    ]);
    expect(labels.get('cat-apparel')).toBe('Apparel');
    expect(labels.get('cat-tea')).toBe('Tea & Coffee');
    // 'Ghee' lower-cases to the exact slug of cat-ghee-1, so it resolves there.
    expect(labels.get('cat-ghee-1')).toBe('Ghee');
    expect(labels.get('cat-ghee-2')).toBe('ghee-2');
    expect(labels.get('cat-old')).toBe('old-stock');
  });
});
