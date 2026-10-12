import { apiFetch } from './api-client';
import type { HomeContent, HeroContent, PromoContent, WhyItem, HomeBlock } from '@belzo/shared';
import { DEFAULT_HOME_CLASSIC, DEFAULT_HOME_EMART, mergeHome, type ThemeName } from '@belzo/shared';

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
