import type { CategoryNodeDto } from '@belzo/shared';
import { categoryNav, categoryTrail } from './category-trail';

const node = (slug: string, children: CategoryNodeDto[] = []): CategoryNodeDto => ({
  id: `id-${slug}`,
  name: slug.toUpperCase(),
  slug,
  imageUrl: null,
  children,
});

const tree = [
  node('house', [
    node('toilet'),
    node('floor'),
    node('dish'),
  ]),
  node('grocery', [node('rice', [node('basmati'), node('sona')])]),
  node('toys'),
];

describe('categoryTrail', () => {
  it('finds the path from the top category down', () => {
    expect(categoryTrail(tree, 'floor')!.map((n) => n.slug)).toEqual(['house', 'floor']);
    expect(categoryTrail(tree, 'basmati')!.map((n) => n.slug)).toEqual(['grocery', 'rice', 'basmati']);
    expect(categoryTrail(tree, 'toys')!.map((n) => n.slug)).toEqual(['toys']);
  });

  it('returns null for an unknown category', () => {
    expect(categoryTrail(tree, 'nope')).toBeNull();
    expect(categoryTrail([], 'x')).toBeNull();
  });
});

describe('categoryNav', () => {
  it('on a parent: breadcrumb has just itself, chips are its sub-categories, no back link', () => {
    const nav = categoryNav(tree, 'house');
    expect(nav.crumbs.map((n) => n.slug)).toEqual(['house']);
    expect(nav.parent).toBeNull();
    expect(nav.chips.map((n) => n.slug)).toEqual(['toilet', 'floor', 'dish']);
    expect(nav.chipsAreSiblings).toBe(false);
  });

  it('on a sub-category: breadcrumb shows the parent, a back link, and the siblings as chips', () => {
    const nav = categoryNav(tree, 'floor');
    expect(nav.crumbs.map((n) => n.slug)).toEqual(['house', 'floor']);
    expect(nav.parent!.slug).toBe('house');
    expect(nav.chips.map((n) => n.slug)).toEqual(['toilet', 'floor', 'dish']);
    expect(nav.chipsAreSiblings).toBe(true);
  });

  it('in the middle of three levels it shows its own children, and goes back one level', () => {
    const nav = categoryNav(tree, 'rice');
    expect(nav.crumbs.map((n) => n.slug)).toEqual(['grocery', 'rice']);
    expect(nav.parent!.slug).toBe('grocery');
    expect(nav.chips.map((n) => n.slug)).toEqual(['basmati', 'sona']);
    expect(nav.chipsAreSiblings).toBe(false);
  });

  it('a top-level category with no children has no chips and no back link', () => {
    const nav = categoryNav(tree, 'toys');
    expect(nav.chips).toEqual([]);
    expect(nav.parent).toBeNull();
  });

  it('an unknown category gives an empty nav instead of failing', () => {
    expect(categoryNav(tree, 'nope')).toEqual({ crumbs: [], parent: null, chips: [], chipsAreSiblings: false });
  });
});
