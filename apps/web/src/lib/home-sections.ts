import type { HomeSection } from '@belzo/shared';
import type { CategoryNodeDto, ProductCardDto } from '@belzo/shared';
import { catalogueApi, type Paginated } from './catalogue-api';

export { DEFAULT_SECTIONS, sanitizeHomeSections, getHomeSections } from '@belzo/shared';

const EMPTY: Paginated<ProductCardDto> = { items: [], total: 0, page: 1, pageSize: 0 };

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
