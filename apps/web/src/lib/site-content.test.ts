import type { HomeContent } from '@belzo/shared';

// Mock the API client so getSiteContent's network call is controllable.
jest.mock('@/lib/api-client', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '@/lib/api-client';
import {
  mergeHome,
  getSiteContent,
  DEFAULT_HOME_EMART,
  DEFAULT_HOME_CLASSIC,
} from '@/lib/site-content';

const mockFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('site-content — mergeHome', () => {
  it('returns the theme default when nothing is stored', () => {
    expect(mergeHome('emart', null)).toEqual(DEFAULT_HOME_EMART);
    expect(mergeHome('classic', undefined)).toEqual(DEFAULT_HOME_CLASSIC);
  });

  it('falls back to theme default promos/why when stored arrays are empty', () => {
    const merged = mergeHome('emart', { promos: [], why: [], blocks: [] });
    expect(merged.promos).toEqual(DEFAULT_HOME_EMART.promos);
    expect(merged.why).toEqual(DEFAULT_HOME_EMART.why);
  });

  it('honors an explicitly empty blocks array', () => {
    const merged = mergeHome('classic', { blocks: [] });
    expect(merged.blocks).toEqual([]);
  });

  it('uses stored promos when present', () => {
    const promos = [{ title: 'Custom', subtitle: '', cta: 'Go', href: '/x', icon: '⭐', color: 'blue' as const }];
    const merged = mergeHome('classic', { promos });
    expect(merged.promos).toEqual(promos);
  });

  it('merges a partial hero over the theme default hero', () => {
    const merged = mergeHome('emart', { hero: { line1: 'Hello' } as HomeContent['hero'] });
    expect(merged.hero.line1).toBe('Hello');
    expect(merged.hero.eyebrow).toBe(DEFAULT_HOME_EMART.hero.eyebrow);
  });
});

describe('site-content — DEFAULT_HOME_CLASSIC', () => {
  it('reproduces today’s exact 4 classic promo tiles', () => {
    expect(DEFAULT_HOME_CLASSIC.promos).toEqual([
      { title: 'Top Electronics', subtitle: 'Earbuds, chargers & more', cta: 'Grab now', href: '/category/electronics', icon: '📱', color: 'blue' },
      { title: 'Fashion Fiesta', subtitle: 'Trending apparel picks', cta: 'Explore', href: '/category/apparel', icon: '👗', color: 'pink' },
      { title: 'Daily Grocery', subtitle: 'Stock up & save', cta: 'Shop', href: '/category/grocery', icon: '🛒', color: 'green' },
      { title: 'Artisan Handicrafts', subtitle: 'Handmade, Made in India', cta: 'Discover', href: '/category/handicraft', icon: '🎨', color: 'amber' },
    ]);
  });
});

describe('site-content — getSiteContent', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns the classic default on API failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('API down'));
    const res = await getSiteContent();
    expect(res.theme).toBe('classic');
    expect(res.home).toEqual(DEFAULT_HOME_CLASSIC);
    expect(res.sections).toBeNull();
  });

  it('merges the eMart home over the eMart default when theme is emart', async () => {
    mockFetch.mockResolvedValueOnce({
      theme: 'emart',
      home: { promos: [{ title: 'Live Deal', subtitle: '', cta: 'Shop Now', href: '/search', icon: '🛒', color: 'green' }] },
      footer: null,
      sections: null,
    } as never);
    const res = await getSiteContent();
    expect(res.theme).toBe('emart');
    expect(res.home.promos[0]?.title).toBe('Live Deal');
    // why falls back to the eMart default (stored why empty/absent)
    expect(res.home.why).toEqual(DEFAULT_HOME_EMART.why);
  });
});
