import { homeSectionSchema, type HomeContent, type HomeSection } from './schemas';

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

export type ThemeName = 'classic' | 'emart';

/** eMart theme default home content. Drives the eMart home when `home_content`
 *  is unset (zero-config backward compatibility). */
export const DEFAULT_HOME_EMART: HomeContent = {
  hero: {
    eyebrow: '🛒 Belzo eMart',
    line1: 'Your Daily Needs',
    line2: 'Now at Your',
    accent: 'Doorstep',
    subtitle: 'Groceries, personal care and home essentials — fresh, fast and affordable.',
    ctaText: 'Shop Now',
    ctaHref: '/search?sort=discount',
    imageUrl:
      'https://images.unsplash.com/photo-1542838132-92c53300491e?w=900&q=80&auto=format&fit=crop',
  },
  promos: [
    {
      title: 'Fresh & Healthy Groceries',
      subtitle: 'From farm to your home',
      cta: 'Shop Now',
      href: '/search',
      icon: '',
 imageUrl: '',
      color: 'green',
    },
    {
      title: 'Personal Care Essentials',
      subtitle: 'Look Good • Feel Good',
      cta: 'Shop Now',
      href: '/search',
      icon: '',
 imageUrl: '',
      color: 'pink',
    },
    {
      title: 'Home Care Made Easy',
      subtitle: 'Clean Home • Healthy Family',
      cta: 'Shop Now',
      href: '/search',
      icon: '',
 imageUrl: '',
      color: 'blue',
    },
  ],
  why: [
    { icon: '', imageUrl: '', title: 'Fast & Reliable Delivery', sub: 'On time, every time' },
    { icon: '', imageUrl: '', title: '100% Genuine Products', sub: 'Authentic & trusted' },
    { icon: '', imageUrl: '', title: 'Multiple Payment Options', sub: 'UPI, cards & COD' },
    { icon: '', imageUrl: '', title: 'Dedicated Customer Support', sub: 'We\u2019re here to help' },
    { icon: '', imageUrl: '', title: 'Fresh & Quality Products', sub: 'Farm-fresh, hand-picked' },
  ],
  blocks: [],
};

/** Classic theme default home content. The classic home does not render the
 *  hero fields (it uses the banner carousel), so hero here is informational.
 *  The 4 promos reproduce today's exact hardcoded classic tile grid. */
export const DEFAULT_HOME_CLASSIC: HomeContent = {
  hero: {
    eyebrow: '',
    line1: '',
    line2: '',
    accent: '',
    subtitle: '',
    ctaText: 'Shop Now',
    ctaHref: '/search',
    imageUrl: '',
  },
  promos: [
    { title: 'Top Electronics', subtitle: 'Earbuds, chargers & more', cta: 'Grab now', href: '/category/electronics', icon: '', imageUrl: '', color: 'blue' },
    { title: 'Fashion Fiesta', subtitle: 'Trending apparel picks', cta: 'Explore', href: '/category/apparel', icon: '', imageUrl: '', color: 'pink' },
    { title: 'Daily Grocery', subtitle: 'Stock up & save', cta: 'Shop', href: '/category/grocery', icon: '', imageUrl: '', color: 'green' },
    { title: 'Artisan Handicrafts', subtitle: 'Handmade, Made in India', cta: 'Discover', href: '/category/handicraft', icon: '', imageUrl: '', color: 'amber' },
  ],
  why: [],
  blocks: [],
};

const DEFAULTS: Record<ThemeName, HomeContent> = {
  emart: DEFAULT_HOME_EMART,
  classic: DEFAULT_HOME_CLASSIC,
};

/** Merge stored (possibly partial) home content over the per-theme defaults so
 *  the home never renders empty. Empty promos/why fall back to defaults;
 *  `blocks` default to [], so an empty blocks array is honored. */
export function mergeHome(theme: ThemeName, stored?: Partial<HomeContent> | null): HomeContent {
  const d = DEFAULTS[theme];
  if (!stored) return d;
  return {
    hero: { ...d.hero, ...(stored.hero ?? {}) },
    promos: stored.promos && stored.promos.length > 0 ? stored.promos : d.promos,
    why: stored.why && stored.why.length > 0 ? stored.why : d.why,
    blocks: stored.blocks ?? d.blocks,
  };
}

/**
 * The picture of a home tile (promo tile, "why choose us" point or info card), or null when it is
 * a plain text tile. Empty and the "no link" placeholder ('#') both mean "no picture".
 */
export function tileImage(tile: { imageUrl?: string | null }): string | null {
  const url = (tile.imageUrl ?? '').trim();
  return url === '' || url === '#' ? null : url;
}

/** Same as {@link tileImage}, for promo tiles. */
export const promoImage = tileImage;

/** Recommended size of every home tile picture (all tiles are about 16:7). */
export const TILE_IMAGE_SIZE = '800 × 350 px';
export const TILE_IMAGE_ASPECT = 16 / 7;
