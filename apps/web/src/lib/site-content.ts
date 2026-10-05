import { apiFetch } from './api-client';

export type ThemeName = 'classic' | 'emart';

export interface HeroContent {
  eyebrow: string;
  line1: string;
  line2: string;
  accent: string;
  subtitle: string;
  ctaText: string;
  ctaHref: string;
  imageUrl: string;
}
export interface PromoContent {
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  icon: string;
  color: 'green' | 'blue' | 'amber' | 'pink';
}
export interface WhyItem {
  icon: string;
  title: string;
  sub: string;
}
export interface HomeContent {
  hero: HeroContent;
  promos: PromoContent[];
  why: WhyItem[];
}
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

export const DEFAULT_HOME: HomeContent = {
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
};

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

/** Merge stored (possibly partial) home content over the defaults. */
function mergeHome(stored?: Partial<HomeContent> | null): HomeContent {
  if (!stored) return DEFAULT_HOME;
  return {
    hero: { ...DEFAULT_HOME.hero, ...(stored.hero ?? {}) },
    promos: stored.promos && stored.promos.length > 0 ? (stored.promos as PromoContent[]) : DEFAULT_HOME.promos,
    why: stored.why && stored.why.length > 0 ? (stored.why as WhyItem[]) : DEFAULT_HOME.why,
  };
}

/** Read theme + editable home/footer content from the public settings endpoint. */
export async function getSiteContent(): Promise<SiteContent> {
  try {
    const s = await apiFetch<RawPublicSettings>('/settings/public', { revalidate: 30 });
    return {
      theme: s.theme === 'emart' ? 'emart' : 'classic',
      home: mergeHome(s.home),
      footer: { ...DEFAULT_FOOTER, ...(s.footer ?? {}) },
      sections: s.sections ?? null,
    };
  } catch {
    return { theme: 'classic', home: DEFAULT_HOME, footer: DEFAULT_FOOTER, sections: null };
  }
}
