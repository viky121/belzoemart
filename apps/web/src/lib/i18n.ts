import { cookies, headers } from 'next/headers';
import en from '../../messages/en.json';
import hi from '../../messages/hi.json';

/**
 * Minimal server-safe i18n (EN/HI). Replaces next-intl's server pipeline, which
 * is incompatible with this Next 14.2 + Node runtime. Locale is resolved from
 * the NEXT_LOCALE cookie, then Accept-Language, defaulting to English. The
 * message catalogs are the same JSON files used before.
 */
export type Locale = 'en' | 'hi';

const DICTS = { en, hi } as const;
export type Messages = typeof en;

export function resolveLocale(): Locale {
  const cookieLocale = cookies().get('NEXT_LOCALE')?.value;
  if (cookieLocale === 'en' || cookieLocale === 'hi') return cookieLocale;
  const header = headers().get('accept-language');
  const requested = header?.split(',')[0]?.trim().slice(0, 2).toLowerCase();
  if (requested === 'hi') return 'hi';
  return 'en';
}

/** Return the message catalog for the active (or given) locale. */
export function getMessages(locale?: Locale): Messages {
  return DICTS[locale ?? resolveLocale()];
}
