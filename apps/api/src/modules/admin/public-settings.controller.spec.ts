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
