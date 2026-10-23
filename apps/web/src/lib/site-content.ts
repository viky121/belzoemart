import { apiFetch } from './api-client';
import { requestCache } from './request-cache';
import type { HomeContent, HeroContent, PromoContent, WhyItem, HomeBlock } from '@belzo/shared';
import {
  DEFAULT_HOME_CLASSIC,
  DEFAULT_HOME_EMART,
  mergeHome,
  sanitizeMobileHome,
  websiteOfferRows,
  type MobileOfferRow,
  type ThemeName,
} from '@belzo/shared';

export { DEFAULT_HOME_CLASSIC, DEFAULT_HOME_EMART, mergeHome, type ThemeName };

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

/** Back-compat alias for any importer still referencing the old name. */
export const DEFAULT_HOME = DEFAULT_HOME_EMART;

export const DEFAULT_FOOTER: FooterContent = {
  description:
    'Belzo eMart is your trusted online store for groceries, personal care, home care and FMCG products. Shop smart, live better.',
  phone: '+91 98765 43210',
  email: 'support@belzoemart.com',
  hours: 'Mon–Sun · 9:00 AM – 9:00 PM',
  newsletter: 'Subscribe to Our Newsletter',
  facebook: '#',
  instagram: '#',
  youtube: '#',
  linkedin: '#',
  copyright: 'Belzo eMart',
};

export interface SiteContent {
  theme: ThemeName;
  home: HomeContent;
  footer: FooterContent;
  /** Raw home-section config from the API (sanitized/validated by the resolver). */
  sections: unknown;
  /** Offer-banner rows the admin marked "App and website" (Admin → Mobile app → Offer rows). */
  offerRows: MobileOfferRow[];
  /** Saved home section order, as served (resolved against the content when rendering). */
  homeLayout: unknown;
}

interface RawPublicSettings {
  theme?: string;
  home?: Partial<HomeContent> | null;
  footer?: Partial<FooterContent> | null;
  sections?: unknown;
  /** Shared with the mobile app: only offer rows marked "App and website" are shown on the website home. */
  mobileHome?: unknown;
  /** Saved order of the home sections (Admin → Pages → Home page design). */
  homeLayout?: unknown;
}

/**
 * Fetch the public settings once per server render. `cache` (React request
 * memoization) dedupes every caller in the same request — the layout, the home
 * page's `getTheme()`, and `getSiteContent()` all share a single
 * `/settings/public` round-trip instead of 3–4 separate ones.
 */
export const fetchPublicSettings = requestCache(
  async (): Promise<RawPublicSettings> => apiFetch<RawPublicSettings>('/settings/public'),
);

/** Read theme + editable home/footer content from the public settings endpoint. */
export async function getSiteContent(): Promise<SiteContent> {
  try {
    const s = await fetchPublicSettings();
    const theme: ThemeName = s.theme === 'emart' ? 'emart' : 'classic';
    return {
      theme,
      home: mergeHome(theme, s.home),
      footer: { ...DEFAULT_FOOTER, ...(s.footer ?? {}) },
      sections: s.sections ?? null,
      offerRows: websiteOfferRows(sanitizeMobileHome(s.mobileHome).offerRows),
      homeLayout: s.homeLayout ?? null,
    };
  } catch {
    return {
      theme: 'classic',
      home: DEFAULT_HOME_CLASSIC,
      footer: DEFAULT_FOOTER,
      sections: null,
      offerRows: [],
      homeLayout: null,
    };
  }
}
