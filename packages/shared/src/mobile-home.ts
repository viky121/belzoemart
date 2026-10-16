import { z } from 'zod';
import type { CategoryNodeDto } from './catalogue';
import { safeHrefSchema } from './schemas';

/**
 * Mobile app home configuration (admin "Mobile" module), stored as one JSON
 * setting (`mobile.home`) and served through GET /settings/public as `mobileHome`.
 *
 * Everything is optional on the app side: an unset/empty config leaves the app
 * looking exactly as it does today (legacy home_hero banners, all categories in
 * tree order, "Deals of the Day" on, no offer rows).
 */

export const MOBILE_HOME_KEY = 'mobile.home';

/** Where an offer row sits on the home screen. */
export const MOBILE_OFFER_POSITIONS = ['after_hero', 'after_categories', 'after_deals'] as const;
export type MobileOfferPosition = (typeof MOBILE_OFFER_POSITIONS)[number];

/** Banners per row: 1 = full width, 2 or 3 = side by side. */
export const MOBILE_OFFER_COLUMNS = [1, 2, 3] as const;
export type MobileOfferColumns = (typeof MOBILE_OFFER_COLUMNS)[number];

/**
 * Width / height of an offer banner cell for each column count. Shared by the
 * admin preview and the app so they always match. Recommended upload sizes:
 * 1 col 1000×400, 2 cols 600×400, 3 cols 400×400.
 */
export const MOBILE_OFFER_ASPECT: Record<MobileOfferColumns, number> = { 1: 2.5, 2: 1.5, 3: 1 };
export const MOBILE_OFFER_SIZE_HINT: Record<MobileOfferColumns, string> = {
  1: '1000 × 400 px',
  2: '600 × 400 px',
  3: '400 × 400 px',
};

export const MOBILE_LIMITS = {
  heroBanners: 10,
  categories: 100,
  offerRows: 12,
  bannersPerRow: 12,
} as const;

/** A tappable banner image. Requires a real image; the link may be '#' (not tappable). */
export const mobileBannerSchema = z.object({
  id: z.string().min(1).max(64),
  imageUrl: safeHrefSchema.refine((s) => s !== '' && s !== '#', 'An image is required'),
  linkUrl: safeHrefSchema.default('#'),
  title: z.string().trim().max(120).default(''),
  enabled: z.boolean().default(true),
});
export type MobileBanner = z.infer<typeof mobileBannerSchema>;

/** Per-category tweak. Array order = display order; unlisted categories follow in tree order. */
export const mobileCategorySchema = z.object({
  categoryId: z.string().uuid(),
  /** Label shown in the app instead of the category name ('' = use the real name). */
  name: z.string().trim().max(40).default(''),
  /** Icon image shown instead of the category image ('' = use category image / built-in icon). */
  iconUrl: safeHrefSchema.default(''),
  hidden: z.boolean().default(false),
});
export type MobileCategoryOverride = z.infer<typeof mobileCategorySchema>;

export const mobileOfferRowSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().max(80).default(''),
  columns: z
    .number()
    .int()
    .min(1)
    .max(3)
    .default(2)
    .transform((n) => n as MobileOfferColumns),
  position: z.enum(MOBILE_OFFER_POSITIONS).default('after_categories'),
  banners: z.array(mobileBannerSchema).max(MOBILE_LIMITS.bannersPerRow).default([]),
  enabled: z.boolean().default(true),
});
export type MobileOfferRow = z.infer<typeof mobileOfferRowSchema>;

/** Strict schema: used by the admin editor and PUT /admin/mobile-home to reject bad input. */
export const mobileHomeSchema = z.object({
  heroBanners: z.array(mobileBannerSchema).max(MOBILE_LIMITS.heroBanners).default([]),
  categories: z.array(mobileCategorySchema).max(MOBILE_LIMITS.categories).default([]),
  offerRows: z.array(mobileOfferRowSchema).max(MOBILE_LIMITS.offerRows).default([]),
  dealsEnabled: z.boolean().default(true),
  dealsTitle: z.string().trim().min(1).max(60).default('Deals of the Day'),
});
export type MobileHome = z.infer<typeof mobileHomeSchema>;

export const DEFAULT_MOBILE_HOME: MobileHome = {
  heroBanners: [],
  categories: [],
  offerRows: [],
  dealsEnabled: true,
  dealsTitle: 'Deals of the Day',
};

/** Parse each array entry on its own, keep the valid ones (defaults applied), cap at `max`. */
function keepValid<S extends z.ZodTypeAny>(raw: unknown, schema: S, max: number): z.output<S>[] {
  const out: z.output<S>[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const r = schema.safeParse(item);
    if (r.success) out.push(r.data);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Lenient read of the stored value: one bad banner/row/category is dropped, never
 * the whole config. Always returns a complete MobileHome (defaults for missing
 * parts), so the app can render without null checks.
 */
export function sanitizeMobileHome(value: unknown): MobileHome {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  const offerRows: MobileOfferRow[] = [];
  for (const rawRow of Array.isArray(v.offerRows) ? v.offerRows : []) {
    if (offerRows.length >= MOBILE_LIMITS.offerRows) break;
    if (!rawRow || typeof rawRow !== 'object') continue;
    const row = rawRow as Record<string, unknown>;
    const banners = keepValid(row.banners, mobileBannerSchema, MOBILE_LIMITS.bannersPerRow);
    const parsed = mobileOfferRowSchema.safeParse({ ...row, banners });
    if (parsed.success) offerRows.push(parsed.data);
  }

  const dealsTitle = mobileHomeSchema.shape.dealsTitle.safeParse(v.dealsTitle);
  return {
    heroBanners: keepValid(v.heroBanners, mobileBannerSchema, MOBILE_LIMITS.heroBanners),
    categories: keepValid(v.categories, mobileCategorySchema, MOBILE_LIMITS.categories),
    offerRows,
    dealsEnabled: typeof v.dealsEnabled === 'boolean' ? v.dealsEnabled : true,
    dealsTitle: dealsTitle.success ? dealsTitle.data : DEFAULT_MOBILE_HOME.dealsTitle,
  };
}

/** Banners that should actually be shown: enabled and with a real image. */
export function activeBanners(banners: MobileBanner[]): MobileBanner[] {
  return banners.filter((b) => b.enabled && b.imageUrl !== '' && b.imageUrl !== '#');
}

/** Enabled offer rows (with their enabled banners) for one position; empty rows are dropped. */
export function offerRowsAt(rows: MobileOfferRow[], position: MobileOfferPosition): MobileOfferRow[] {
  return rows
    .filter((r) => r.enabled && r.position === position)
    .map((r) => ({ ...r, banners: activeBanners(r.banners) }))
    .filter((r) => r.banners.length > 0);
}

/** A top-level category as shown on the mobile home / categories tab. */
export interface MobileCategoryTile {
  id: string;
  /** Label to display (override or the real name). */
  name: string;
  /** Icon image to display, or null to fall back to the built-in icon. */
  iconUrl: string | null;
  node: CategoryNodeDto;
}

/**
 * Apply admin overrides to the top-level category tree.
 * - Overridden categories come first, in the order the admin arranged them.
 * - Categories without an override follow in tree order, so a newly added
 *   category appears automatically at the end.
 * - Hidden categories are removed; overrides pointing at deleted categories are ignored.
 */
export function resolveMobileCategories(
  tree: CategoryNodeDto[],
  overrides: MobileCategoryOverride[],
): MobileCategoryTile[] {
  const byId = new Map(tree.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const tiles: MobileCategoryTile[] = [];

  const push = (node: CategoryNodeDto, o?: MobileCategoryOverride) => {
    tiles.push({
      id: node.id,
      name: o?.name ? o.name : node.name,
      iconUrl: o?.iconUrl ? o.iconUrl : node.imageUrl,
      node,
    });
  };

  for (const o of overrides) {
    const node = byId.get(o.categoryId);
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    if (!o.hidden) push(node, o);
  }
  for (const node of tree) {
    if (!seen.has(node.id)) push(node);
  }
  return tiles;
}
