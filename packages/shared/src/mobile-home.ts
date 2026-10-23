import { z } from 'zod';
import type { CategoryNodeDto } from './catalogue';
import { MOBILE_FESTIVALS, isValidDateKey } from './festivals';
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

/** `YYYY-MM-DD` (India date) or '' for "no limit". */
const festivalDateSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || isValidDateKey(v), 'Use a valid date')
  .default('');

// ───────────────────────── ☰ menu (contact, store, links) ─────────────────────────

/** A full https:// link, or '' to leave it out (the menu item then hides itself). */
const httpsLinkSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v), 'Use a full https:// link');

/** A phone number (mobile or landline with STD code), or '' to leave it out. */
const menuPhoneSchema = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === '' || /^\+?[\d][\d\s-]{6,18}$/.test(v), 'Enter a valid phone number');

/**
 * Contact, store and link details shown by the app's ☰ menu (Customer Care, Store Locator,
 * Share, Rate Us, About). Edited in Admin → Mobile app → App menu, so none of it needs an app
 * update. An empty value hides the matching menu action instead of showing a dead button.
 */
export const mobileMenuSchema = z.object({
  /** Customer Care phone (call + WhatsApp number when no WhatsApp link is given). */
  carePhone: menuPhoneSchema.default('8839095625'),
  careEmail: z
    .string()
    .trim()
    .max(190)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address')
    .default('Belzoemart@gmail.com'),
  careWhatsappUrl: httpsLinkSchema.default('https://wa.me/918839095625'),
  /** e.g. "Mon–Sat, 9 AM – 8 PM" */
  careHours: z.string().trim().max(120).default(''),
  storeName: z.string().trim().max(80).default('Belzo eMart'),
  /** One line per row. */
  storeAddress: z
    .string()
    .trim()
    .max(300)
    .default('Brahman Colony, Kunvar Pura Road\nNear City Hospital\nTikamgarh, Madhya Pradesh 472001'),
  storeMapsUrl: httpsLinkSchema.default('https://maps.app.goo.gl/Vg1QP7QuiYZDKbuA9'),
  storeHours: z.string().trim().max(120).default(''),
  /** Store helpline number. */
  storeHelpline: menuPhoneSchema.default(''),
  website: httpsLinkSchema.default('https://belzoemart.com'),
  /** Link sent by "Share Belzo eMart" ('' = the website). Point this at the Play Store once published. */
  shareUrl: httpsLinkSchema.default(''),
  /** "Rate Us" opens these; with no link for the phone's platform the item is hidden. */
  playStoreUrl: httpsLinkSchema.default(''),
  appStoreUrl: httpsLinkSchema.default(''),
});
export type MobileMenu = z.infer<typeof mobileMenuSchema>;

export const DEFAULT_MOBILE_MENU: MobileMenu = {
  carePhone: '8839095625',
  careEmail: 'Belzoemart@gmail.com',
  careWhatsappUrl: 'https://wa.me/918839095625',
  careHours: '',
  storeName: 'Belzo eMart',
  storeAddress: 'Brahman Colony, Kunvar Pura Road\nNear City Hospital\nTikamgarh, Madhya Pradesh 472001',
  storeMapsUrl: 'https://maps.app.goo.gl/Vg1QP7QuiYZDKbuA9',
  storeHours: '',
  storeHelpline: '',
  website: 'https://belzoemart.com',
  shareUrl: '',
  playStoreUrl: '',
  appStoreUrl: '',
};

/**
 * Lenient read: a field that is missing or malformed falls back to its default, the rest of the
 * menu config is kept. (An admin-cleared field stays '' on purpose: that hides the item.)
 */
export function sanitizeMobileMenu(value: unknown): MobileMenu {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const out = { ...DEFAULT_MOBILE_MENU };
  for (const key of Object.keys(DEFAULT_MOBILE_MENU) as (keyof MobileMenu)[]) {
    if (v[key] === undefined) continue;
    const parsed = mobileMenuSchema.shape[key].safeParse(v[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return out;
}

/** Address rows for display. */
export function menuAddressLines(address: string): string[] {
  return address
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** `tel:` target for a displayed phone number, or null when there is none. */
export function menuTelHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.length >= 7 ? `tel:${digits}` : null;
}

/** Strict schema: used by the admin editor and PUT /admin/mobile-home to reject bad input. */
export const mobileHomeSchema = z.object({
  heroBanners: z.array(mobileBannerSchema).max(MOBILE_LIMITS.heroBanners).default([]),
  categories: z.array(mobileCategorySchema).max(MOBILE_LIMITS.categories).default([]),
  offerRows: z.array(mobileOfferRowSchema).max(MOBILE_LIMITS.offerRows).default([]),
  dealsEnabled: z.boolean().default(true),
  dealsTitle: z.string().trim().min(1).max(60).default('Deals of the Day'),
  /** Active festival theme ('none' = normal Belzo look). */
  festival: z.enum(MOBILE_FESTIVALS).default('none'),
  /** Custom greeting for the festival banner ('' = the festival's default greeting). */
  festivalGreeting: z.string().trim().max(60).default(''),
  /** Falling decorations in the festival banner (the app also honours "reduce motion"). */
  festivalDecor: z.boolean().default(true),
  /** First day the theme shows (India date, inclusive). '' = no start limit. */
  festivalStart: festivalDateSchema,
  /** Last day the theme shows (India date, inclusive). '' = no end limit. */
  festivalEnd: festivalDateSchema,
  /** ☰ menu contact / store / link details. */
  menu: mobileMenuSchema.default(DEFAULT_MOBILE_MENU),
});
export type MobileHome = z.infer<typeof mobileHomeSchema>;

export const DEFAULT_MOBILE_HOME: MobileHome = {
  heroBanners: [],
  categories: [],
  offerRows: [],
  dealsEnabled: true,
  dealsTitle: 'Deals of the Day',
  festival: 'none',
  festivalGreeting: '',
  festivalDecor: true,
  festivalStart: '',
  festivalEnd: '',
  menu: DEFAULT_MOBILE_MENU,
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
    // An unknown / malformed festival never breaks the app: it falls back to the normal look.
    festival: mobileHomeSchema.shape.festival.catch('none').parse(v.festival),
    festivalGreeting: mobileHomeSchema.shape.festivalGreeting.catch('').parse(v.festivalGreeting),
    festivalDecor: typeof v.festivalDecor === 'boolean' ? v.festivalDecor : true,
    // A malformed date is dropped (= no limit on that side) rather than breaking the config.
    festivalStart: mobileHomeSchema.shape.festivalStart.catch('').parse(v.festivalStart),
    festivalEnd: mobileHomeSchema.shape.festivalEnd.catch('').parse(v.festivalEnd),
    menu: sanitizeMobileMenu(v.menu),
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
