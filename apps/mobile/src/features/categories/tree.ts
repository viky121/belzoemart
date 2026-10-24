import type { CategoryNodeDto } from '@belzo/shared';

/** Depth-first lookup of a category by slug across all three levels (design §2.6). */
export function findBySlug(nodes: CategoryNodeDto[], slug: string): CategoryNodeDto | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const found = findBySlug(node.children, slug);
    if (found) return found;
  }
  return null;
}

/** Flatten the category tree depth-first (parents before children). */
export function flattenCategories(nodes: CategoryNodeDto[]): CategoryNodeDto[] {
  const out: CategoryNodeDto[] = [];
  for (const node of nodes) {
    out.push(node);
    out.push(...flattenCategories(node.children));
  }
  return out;
}
