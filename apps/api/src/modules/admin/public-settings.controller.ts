import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { homeSectionSchema, type HomeSection } from '@belzo/shared';
import { Public } from '../../common/auth/public.decorator';
import { SettingsService } from './settings.service';

const THEMES = ['classic', 'emart'];

/**
 * Public storefront settings (whitelisted). Exposes only presentation settings
 * the web app needs at render time: the active theme plus the admin-editable
 * home-page and footer content (stored as JSON under `home_content` /
 * `footer_content`). The web app merges these over its built-in defaults.
 */
@ApiTags('public-settings')
@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('public')
  async publicSettings(): Promise<{
    theme: string;
    home: unknown;
    footer: unknown;
    sections: HomeSection[] | null;
  }> {
    const [theme, home, footer, sections] = await Promise.all([
      this.settings.get<string>('theme'),
      this.settings.get<object>('home_content'),
      this.settings.get<object>('footer_content'),
      this.settings.get<unknown>('home.sections'),
    ]);
    // Per-section sanitize: drop invalid entries, keep valid ones (with zod
    // defaults applied), cap at 24. Return null only when nothing valid remains
    // so the storefront falls back to its built-in default sections.
    const raw = Array.isArray(sections) ? sections : [];
    const valid = raw
      .map((s) => homeSectionSchema.safeParse(s))
      .filter((r): r is { success: true; data: HomeSection } => r.success)
      .map((r) => r.data)
      .slice(0, 24);
    return {
      theme: theme && THEMES.includes(theme) ? theme : 'classic',
      home: home ?? null,
      footer: footer ?? null,
      sections: valid.length > 0 ? valid : null,
    };
  }

  /**
   * Public serviceability check for a PIN code. `configured` is false when no
   * serviceable list is set (delivery open everywhere). When a PIN is passed,
   * `serviceable` reflects whether we deliver there.
   */
  @Public()
  @Get('serviceability')
  async serviceability(
    @Query('pincode') pincode?: string,
  ): Promise<{ serviceable: boolean; configured: boolean }> {
    const raw = await this.settings.get<unknown>('shipping.serviceablePincodes');
    const list = Array.isArray(raw) ? raw.map((p) => String(p).trim()).filter(Boolean) : [];
    const pin = (pincode ?? '').trim();
    const configured = list.length > 0;
    const serviceable = !configured ? true : pin.length > 0 && list.includes(pin);
    return { serviceable, configured };
  }
}
