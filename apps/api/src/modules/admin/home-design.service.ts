import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  DEFAULT_SECTIONS,
  HOME_LAYOUT_MAX,
  MOBILE_HOME_KEY,
  MOBILE_LIMITS,
  homeBlockSchema,
  homeLayoutSchema,
  homeSectionsSchema,
  mergeHome,
  mobileOfferRowSchema,
  promoContentSchema,
  resolveHomeLayout,
  sanitizeHomeContent,
  sanitizeHomeLayout,
  sanitizeHomeSections,
  sanitizeMobileHome,
  whyItemSchema,
  type HomeBlock,
  type HomeLayoutItem,
  type HomeSection,
  type MobileOfferRow,
  type PromoContent,
  type WhyItem,
} from '@belzo/shared';
import { SettingsService } from './settings.service';

export const HOME_LAYOUT_KEY = 'home.layout';
const SECTIONS_KEY = 'home.sections';
const THEMES = ['classic', 'emart'] as const;

/** What the "Home page design" editor works on: the order plus every section's content. */
export interface HomeDesign {
  theme: (typeof THEMES)[number];
  layout: HomeLayoutItem[];
  productSections: HomeSection[];
  offerRows: MobileOfferRow[];
  blocks: HomeBlock[];
  promos: PromoContent[];
  why: WhyItem[];
}

export const homeDesignInputSchema = z.object({
  layout: homeLayoutSchema,
  productSections: homeSectionsSchema,
  offerRows: z.array(mobileOfferRowSchema).max(MOBILE_LIMITS.offerRows),
  blocks: z.array(homeBlockSchema).max(10),
  promos: z.array(promoContentSchema).min(1).max(12),
  why: z.array(whyItemSchema).min(1).max(12),
});
export type HomeDesignInput = z.infer<typeof homeDesignInputSchema>;

/**
 * Home page design (Admin → Pages → Home page design). Reads and writes the same stores the
 * rest of the product already uses, so the app and the website keep sharing one source:
 *  - order            → `home.layout`
 *  - product sections → `home.sections`
 *  - offer banners    → the Mobile app offer rows (`mobile.home`)
 *  - banner/card blocks, promo tiles, "why choose us" → the active theme's home content
 */
@Injectable()
export class HomeDesignService {
  constructor(private readonly settings: SettingsService) {}

  private async activeTheme(): Promise<HomeDesign['theme']> {
    const t = await this.settings.get<string>('theme');
    return (THEMES as readonly string[]).includes(t ?? '') ? (t as HomeDesign['theme']) : 'classic';
  }

  private contentKey(theme: HomeDesign['theme']): string {
    return theme === 'emart' ? 'home_content' : 'home_content.classic';
  }

  async get(): Promise<HomeDesign> {
    const theme = await this.activeTheme();
    const [rawSections, rawMobile, rawHome, rawLayout] = await Promise.all([
      this.settings.get<unknown>(SECTIONS_KEY),
      this.settings.get<unknown>(MOBILE_HOME_KEY),
      this.settings.get<unknown>(this.contentKey(theme)),
      this.settings.get<unknown>(HOME_LAYOUT_KEY),
    ]);
    const productSections = sanitizeHomeSections(rawSections) ?? DEFAULT_SECTIONS.map((s) => ({ ...s }));
    const { offerRows } = sanitizeMobileHome(rawMobile);
    const home = mergeHome(theme, sanitizeHomeContent(rawHome));
    const layout = resolveHomeLayout(rawLayout, {
      offerRows,
      sections: productSections,
      blocks: home.blocks,
    });
    return { theme, layout, productSections, offerRows, blocks: home.blocks, promos: home.promos, why: home.why };
  }

  async put(actorId: string, input: HomeDesignInput): Promise<HomeDesign> {
    const theme = await this.activeTheme();
    const key = this.contentKey(theme);

    // Only the order and the built-in sections' on/off are kept in the layout; a section that
    // was added is on or off through its own content entry.
    const layout = sanitizeHomeLayout(input.layout)
      .slice(0, HOME_LAYOUT_MAX)
      .map((i) => (i.refId ? { ...i, enabled: true } : i));

    const [rawHome, rawMobile] = await Promise.all([
      this.settings.get<unknown>(key),
      this.settings.get<unknown>(MOBILE_HOME_KEY),
    ]);
    const home = rawHome && typeof rawHome === 'object' ? (rawHome as Record<string, unknown>) : {};
    const mobile = sanitizeMobileHome(rawMobile);

    // Everything has been validated by the schema; write the stores, content first and the order last.
    await this.settings.set(actorId, SECTIONS_KEY, input.productSections);
    await this.settings.set(actorId, key, {
      ...home,
      promos: input.promos,
      why: input.why,
      blocks: input.blocks,
    });
    await this.settings.set(actorId, MOBILE_HOME_KEY, { ...mobile, offerRows: input.offerRows });
    await this.settings.set(actorId, HOME_LAYOUT_KEY, layout);
    return this.get();
  }
}
