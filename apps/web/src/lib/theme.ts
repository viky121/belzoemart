import { fetchPublicSettings } from './site-content';

export type ThemeName = 'classic' | 'emart';

/**
 * Read the admin-selected active storefront theme (server-side). Shares the
 * cached `/settings/public` fetch with `getSiteContent()` so the home page
 * resolves theme + content in a single round-trip.
 */
export async function getTheme(): Promise<ThemeName> {
  try {
    const s = await fetchPublicSettings();
    return s.theme === 'emart' ? 'emart' : 'classic';
  } catch {
    return 'classic';
  }
}
