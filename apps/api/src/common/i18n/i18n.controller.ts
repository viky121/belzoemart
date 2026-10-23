import { Controller, Get, Headers } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@belzo/shared';
import { Public } from '../auth/public.decorator';
import { translate } from './messages';

/**
 * Sample localized endpoint demonstrating EN/HI resolution from the
 * Accept-Language header. Useful as a smoke test for i18n wiring.
 */
@ApiTags('i18n')
@Controller('welcome')
export class I18nController {
  @Public()
  @Get()
  welcome(@Headers('accept-language') acceptLanguage?: string): { locale: Locale; message: string } {
    const locale = this.resolveLocale(acceptLanguage);
    return { locale, message: translate('welcome', locale) };
  }

  private resolveLocale(acceptLanguage?: string): Locale {
    const requested = acceptLanguage?.split(',')[0]?.trim().slice(0, 2).toLowerCase();
    return (SUPPORTED_LOCALES as readonly string[]).includes(requested ?? '')
      ? (requested as Locale)
      : DEFAULT_LOCALE;
  }
}
