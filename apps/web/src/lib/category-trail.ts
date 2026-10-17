import type { CategoryNodeDto } from '@belzo/shared';

/** Path from a top-level category down to `slug` (inclusive), or null when it isn't in the tree. */
export function categoryTrail(nodes: CategoryNodeDto[], slug: string): CategoryNodeDto[] | null {
  for (const n of nodes) {
    if (n.slug === slug) return [n];
    const below = categoryTrail(n.children, slug);
    if (below) return [n, ...below];
  }
  return null;
}

export interface CategoryNav {
  /** Home › Parent › Current, outermost first (the last one is the page being viewed). */
  crumbs: CategoryNodeDto[];
  /** The category one level up, if any (for the "back" link). */
  parent: CategoryNodeDto | null;
  /**
   * The chips to show: the category's own sub-categories, or, on a category with none, its
   * siblings under the same parent, so the visitor can move sideways without going back.
   */
  chips: CategoryNodeDto[];
  /** Whether `chips` are siblings of the current category (so the current one is among them). */
  chipsAreSiblings: boolean;
}

export function categoryNav(nodes: CategoryNodeDto[], slug: string): CategoryNav {
  const crumbs = categoryTrail(nodes, slug) ?? [];
  const current = crumbs[crumbs.length - 1];
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2]! : null;
  if (current && current.children.length > 0) {
    return { crumbs, parent, chips: current.children, chipsAreSiblings: false };
  }
  if (parent) return { crumbs, parent, chips: parent.children, chipsAreSiblings: true };
  return { crumbs, parent, chips: [], chipsAreSiblings: false };
}
