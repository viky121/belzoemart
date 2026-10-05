import { PublicSettingsController } from './public-settings.controller';
import type { SettingsService } from './settings.service';

const UUID = '11111111-1111-4111-8111-111111111111';

/**
 * Unit tests for the per-section sanitize logic in GET /settings/public.
 * A fake SettingsService returns a fixed value for `home.sections`; all other
 * keys resolve to null so the theme/home/footer fields default cleanly.
 */
describe('PublicSettingsController.publicSettings — home.sections sanitize', () => {
  function build(sectionsValue: unknown) {
    const settings = {
      get: async (key: string) => (key === 'home.sections' ? sectionsValue : null),
    } as unknown as SettingsService;
    return new PublicSettingsController(settings);
  }

  it('keeps the valid section and drops the malformed one, applying defaults', async () => {
    const ctrl = build([
      { id: 'ok', title: 'Deals', source: { type: 'sort', sort: 'discount' } },
      { id: 'bad', title: 'Broken', source: { type: 'sort', sort: 'cheapest' } },
    ]);
    const res = await ctrl.publicSettings();
    expect(res.sections).toHaveLength(1);
    expect(res.sections?.[0]).toMatchObject({ id: 'ok', limit: 12, enabled: true });
  });

  it('returns null when the stored value is missing', async () => {
    const ctrl = build(null);
    const res = await ctrl.publicSettings();
    expect(res.sections).toBeNull();
  });

  it('returns null when every stored section is invalid', async () => {
    const ctrl = build([{ id: 'bad', title: '', source: { type: 'sort', sort: 'nope' } }]);
    const res = await ctrl.publicSettings();
    expect(res.sections).toBeNull();
  });

  it('slices a long valid array down to 24', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`,
      title: `Section ${i}`,
      source: { type: 'category', categoryId: UUID },
    }));
    const ctrl = build(many);
    const res = await ctrl.publicSettings();
    expect(res.sections).toHaveLength(24);
  });
});

/**
 * Theme-aware home content: GET /settings/public serves the active theme's home
 * (eMart from `home_content`, classic from `home_content.classic`), already
 * sanitized. A fake SettingsService answers an arbitrary set of keys.
 */
describe('PublicSettingsController.publicSettings — theme-aware home', () => {
  function build(values: Record<string, unknown>) {
    const settings = {
      get: async (key: string) => values[key] ?? null,
    } as unknown as SettingsService;
    return new PublicSettingsController(settings);
  }

  it('serves the eMart home from home_content when theme is emart', async () => {
    const ctrl = build({
      theme: 'emart',
      home_content: { promos: [{ title: 'eMart Deal' }] },
      'home_content.classic': { promos: [{ title: 'Classic Deal' }] },
    });
    const res = await ctrl.publicSettings();
    expect(res.theme).toBe('emart');
    const home = res.home as { promos: { title: string }[] };
    expect(home.promos).toHaveLength(1);
    expect(home.promos[0]?.title).toBe('eMart Deal');
  });

  it('serves the classic home from home_content.classic when theme is classic', async () => {
    const ctrl = build({
      theme: 'classic',
      home_content: { promos: [{ title: 'eMart Deal' }] },
      'home_content.classic': { promos: [{ title: 'Classic Deal' }] },
    });
    const res = await ctrl.publicSettings();
    expect(res.theme).toBe('classic');
    const home = res.home as { promos: { title: string }[] };
    expect(home.promos[0]?.title).toBe('Classic Deal');
  });

  it('returns null home when the active theme key is unset', async () => {
    const ctrl = build({ theme: 'emart' });
    const res = await ctrl.publicSettings();
    expect(res.home).toBeNull();
  });

  it('degrades a bad href to "#" and drops a malformed promo', async () => {
    const ctrl = build({
      theme: 'emart',
      home_content: {
        promos: [
          { title: 'Good', href: 'javascript:alert(1)' },
          { subtitle: 'no title' },
        ],
      },
    });
    const res = await ctrl.publicSettings();
    const home = res.home as { promos: { title: string; href: string }[] };
    expect(home.promos).toHaveLength(1);
    expect(home.promos[0]?.href).toBe('#');
  });
});
