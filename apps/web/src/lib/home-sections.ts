import { homeSectionSchema, type HomeSection } from '@belzo/shared';
import type { CategoryNodeDto, ProductCardDto } from '@belzo/shared';
import { catalogueApi, type Paginated } from './catalogue-api';

const EMPTY: Paginated<ProductCardDto> = { items: [], total: 0, page: 1, pageSize: 0 };

/**
 * Backward-compatible default sections, used whenever `home.sections` is unset
 * or holds nothing valid. These reproduce today's cross-theme named rails so an
 * unconfigured install looks essentially unchanged and never renders empty.
 */
export const DEFAULT_SECTIONS: HomeSection[] = [
  { id: 'default-deals', title: 'Deals of the Day', source: { type: 'sort', sort: 'discount' }, limit: 12, enabled: true },
  { id: 'default-best-sellers', title: 'Best Sellers', source: { type: 'sort', sort: 'popularity' }, limit: 10, enabled: true },
  { id: 'default-new-arrivals', title: 'New Arrivals', source: { type: 'sort', sort: 'newest' }, limit: 10, enabled: true },
];

/**
 * Per-section sanitize: run the element schema over each entry, keep the valid
 * ones (with zod defaults applied), and return null when none survive so the
 * caller can fall back to DEFAULT_SECTIONS.
 */
export function sanitizeHomeSections(value: unknown): HomeSection[] | null {
  const raw = Array.isArray(value) ? value : [];
  const valid = raw
    .map((s) => homeSectionSchema.safeParse(s))
    .filter((r): r is { success: true; data: HomeSection } => r.success)
    .map((r) => r.data);
  return valid.length > 0 ? valid : null;
}

/**
 * Resolve the configured sections to render: sanitize the raw config (or fall
 * back to defaults), then drop disabled sections while preserving order.
 */
export function getHomeSections(rawSections: unknown): HomeSection[] {
  const sections = sanitizeHomeSections(rawSections) ?? DEFAULT_SECTIONS;
  return sections.filter((s) => s.enabled !== false);
}

export type ResolvedSection = {
  id: string;
  title: string;
  products: ProductCardDto[];
  viewAllHref?: string;
};

/** Flatten the nested category tree into a flat id→slug lookup. */
function flattenCategories(nodes: CategoryNodeDto[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (list: CategoryNodeDto[]): void => {
    for (const n of list) {
      map.set(n.id, n.slug);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return map;
}

/**
 * Resolve each enabled section into its products + a "View all" href, fetching
 * all rails in parallel. One failing rail yields no products and is dropped;
 * sections that resolve to zero products are omitted so empty rails never show.
 */
export async function resolveHomeSections(sections: HomeSection[]): Promise<ResolvedSection[]> {
  const needsCategories = sections.some((s) => s.source.type === 'category');
  const categorySlugs = needsCategories
    ? flattenCategories(await catalogueApi.categories().catch(() => [] as CategoryNodeDto[]))
    : new Map<string, string>();

  const resolved = await Promise.all(
    sections.map(async (s): Promise<ResolvedSection | null> => {
      const qs = new URLSearchParams();
      let viewAllHref: string | undefined;

      if (s.source.type === 'sort') {
        qs.set('sort', s.source.sort);
        qs.set('pageSize', String(s.limit));
        viewAllHref = `/search?sort=${s.source.sort}`;
      } else if (s.source.type === 'category') {
        qs.set('categoryId', s.source.categoryId);
        qs.set('pageSize', String(s.limit));
        const slug = categorySlugs.get(s.source.categoryId);
        viewAllHref = slug ? `/category/${slug}` : `/search?categoryId=${s.source.categoryId}`;
      } else {
        qs.set('ids', s.source.productIds.join(','));
        qs.set('pageSize', String(s.limit));
        viewAllHref = undefined;
      }

      const page = await catalogueApi.products(qs.toString()).catch(() => EMPTY);
      if (page.items.length === 0) return null;
      return { id: s.id, title: s.title, products: page.items, viewAllHref };
    }),
  );

  return resolved.filter((r): r is ResolvedSection => r !== null);
}
