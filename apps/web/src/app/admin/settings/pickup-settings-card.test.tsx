import { renderToStaticMarkup } from 'react-dom/server';
import { PickupSettingsCard } from './pickup-settings-card';

const noop = () => undefined;
const render = (settings: Record<string, unknown>) => renderToStaticMarkup(<PickupSettingsCard settings={settings} onSave={noop} />);

describe('PickupSettingsCard', () => {
  it('shows pickup ON with the default hours and an hour-long slot when nothing is saved', () => {
    const html = render({});
    expect(html).toMatch(/data-testid="setting-pickup\.enabled"[^>]*checked|checked=""[^>]*data-testid="setting-pickup\.enabled"/);
    expect(html).toContain('value="10:00"');
    expect(html).toContain('value="20:00"');
    expect(html).toMatch(/<option value="60" selected="">60 minutes<\/option>/);
    expect(html).not.toContain('pickup-hours-warning');
  });

  it('shows what the shop saved: switched off, own hours, slot length and note', () => {
    const html = render({
      'pickup.enabled': false,
      'pickup.openTime': '09:30',
      'pickup.closeTime': '18:00',
      'pickup.slotMinutes': 30,
      'pickup.note': 'Ask at the counter',
    });
    expect(html).not.toMatch(/data-testid="setting-pickup\.enabled"[^>]*checked|checked=""[^>]*data-testid="setting-pickup\.enabled"/);
    expect(html).toContain('value="09:30"');
    expect(html).toContain('value="18:00"');
    expect(html).toMatch(/<option value="30" selected="">30 minutes<\/option>/);
    expect(html).toContain('Ask at the counter');
  });

  it('warns when the saved hours leave no room for one slot', () => {
    const html = render({ 'pickup.openTime': '10:00', 'pickup.closeTime': '10:20', 'pickup.slotMinutes': 60 });
    expect(html).toContain('data-testid="pickup-hours-warning"');
    expect(html).toContain('10:00 to 20:00');
  });
});
