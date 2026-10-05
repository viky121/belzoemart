import { apiFetch } from './api-client';
import type { HomeContent, HeroContent, PromoContent, WhyItem, HomeBlock } from '@belzo/shared';

export type ThemeName = 'classic' | 'emart';

export type { HomeContent, HeroContent, PromoContent, WhyItem, HomeBlock };

export interface FooterContent {
  description: string;
  phone: string;
  email: string;
  hours: string;
  newsletter: string;
  facebook: string;
  instagram: string;
  youtube: string;
  linkedin: string;
  copyright: string;
}

/** eMart theme default home content. Drives the eMart home when `home_content`
 *  is unset (zero-config backward compatibility). */
export const DEFAULT_HOME_EMART: HomeContent = {
  hero: {
    eyebrow: '🛒 Belzo E Mart',
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
      icon: '🥦',
      color: 'green',
    },
    {
      title: 'Personal Care Essentials',
      subtitle: 'Look Good • Feel Good',
      cta: 'Shop Now',
      href: '/search',
      icon: '🧴',
      color: 'pink',
    },
    {
      title: 'Home Care Made Easy',
      subtitle: 'Clean Home • Healthy Family',
      cta: 'Shop Now',
      href: '/search',
      icon: '🧽',
      color: 'blue',
    },
  ],
  why: [
    { icon: '🚚', title: 'Fast & Reliable Delivery', sub: 'On time, every time' },
    { icon: '🛡️', title: '100% Genuine Products', sub: 'Authentic & trusted' },
    { icon: '💳', title: 'Multiple Payment Options', sub: 'UPI, cards & COD' },
    { icon: '🎧', title: 'Dedicated Customer Support', sub: 'We\u2019re here to help' },
    { icon: '🥬', title: 'Fresh & Quality Products', sub: 'Farm-fresh, hand-picked' },
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
    { title: 'Top Electronics', subtitle: 'Earbuds, chargers & more', cta: 'Grab now', href: '/category/electronics', icon: '📱', color: 'blue' },
    { title: 'Fashion Fiesta', subtitle: 'Trending apparel picks', cta: 'Explore', href: '/category/apparel', icon: '👗', color: 'pink' },
    { title: 'Daily Grocery', subtitle: 'Stock up & save', cta: 'Shop', href: '/category/grocery', icon: '🛒', color: 'green' },
    { title: 'Artisan Handicrafts', subtitle: 'Handmade, Made in India', cta: 'Discover', href: '/category/handicraft', icon: '🎨', color: 'amber' },
  ],
  why: [],
  blocks: [],
};

/** Back-compat alias for any importer still referencing the old name. */
export const DEFAULT_HOME = DEFAULT_HOME_EMART;

export const DEFAULT_FOOTER: FooterContent = {
  description:
    'Belzo E Mart is your trusted online store for groceries, personal care, home care and FMCG products. Shop smart, live better.',
  phone: '+91 98765 43210',
  email: 'support@belzoemart.com',
  hours: 'Mon–Sun · 9:00 AM – 9:00 PM',
  newsletter: 'Subscribe to Our Newsletter',
  facebook: '#',
  instagram: '#',
  youtube: '#',
  linkedin: '#',
  copyright: 'Belzo E Mart',
};

export interface SiteContent {
  theme: ThemeName;
  home: HomeContent;
  footer: FooterContent;
  /** Raw home-section config from the API (sanitized/validated by the resolver). */
  sections: unknown;
}

interface RawPublicSettings {
  theme?: string;
  home?: Partial<HomeContent> | null;
  footer?: Partial<FooterContent> | null;
  sections?: unknown;
}

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

/** Read theme + editable home/footer content from the public settings endpoint. */
export async function getSiteContent(): Promise<SiteContent> {
  try {
    const s = await apiFetch<RawPublicSettings>('/settings/public', { revalidate: 30 });
    const theme: ThemeName = s.theme === 'emart' ? 'emart' : 'classic';
    return {
      theme,
      home: mergeHome(theme, s.home),
      footer: { ...DEFAULT_FOOTER, ...(s.footer ?? {}) },
      sections: s.sections ?? null,
    };
  } catch {
    return { theme: 'classic', home: DEFAULT_HOME_CLASSIC, footer: DEFAULT_FOOTER, sections: null };
  }
}
