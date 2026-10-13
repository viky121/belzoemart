import type { CategoryNodeDto } from '@belzo/shared';

import { findBySlug, flattenCategories } from '../tree';

function node(slug: string, children: CategoryNodeDto[] = []): CategoryNodeDto {
  return { id: `id-${slug}`, name: slug.toUpperCase(), slug, imageUrl: null, children };
}

const tree: CategoryNodeDto[] = [
  node('grocery', [node('staples', [node('rice'), node('atta')]), node('snacks')]),
  node('personal-care', [node('skin', [node('face-wash')])]),
];

describe('findBySlug', () => {
  it('finds a level-1 category', () => {
    expect(findBySlug(tree, 'grocery')?.id).toBe('id-grocery');
  });

  it('finds a level-2 category', () => {
    expect(findBySlug(tree, 'skin')?.id).toBe('id-skin');
  });

  it('finds a deeply nested level-3 category', () => {
    expect(findBySlug(tree, 'face-wash')?.id).toBe('id-face-wash');
    expect(findBySlug(tree, 'rice')?.id).toBe('id-rice');
  });

  it('returns null for an unknown slug', () => {
    expect(findBySlug(tree, 'electronics')).toBeNull();
  });
});

describe('flattenCategories', () => {
  it('lists every node depth-first (parents before children)', () => {
    expect(flattenCategories(tree).map((n) => n.slug)).toEqual([
      'grocery',
      'staples',
      'rice',
      'atta',
      'snacks',
      'personal-care',
      'skin',
      'face-wash',
    ]);
  });
});
