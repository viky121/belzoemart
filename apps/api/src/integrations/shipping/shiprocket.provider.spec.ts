import { ShipRocketProvider } from './shiprocket.provider';
import type { ResilientHttpService } from '../../common/http/resilient-http.service';
import type { SettingsService } from '../../modules/admin/settings.service';

/**
 * Proves the ShipRocket serviceability call sources its warehouse pickup PIN
 * from admin settings (`shipping.pickupPincode`) and defaults to 560001 when
 * the setting is unset or malformed — keeping today's behaviour on a fresh DB.
 */
describe('ShipRocketProvider.checkServiceability — pickup PIN from settings', () => {
  function build(settingsMap: Record<string, unknown>) {
    const urls: string[] = [];
    const http = {
      request: async (_name: string, url: string) => {
        urls.push(url);
        // First call is auth login; subsequent calls are the API endpoints.
        if (url.includes('/auth/login')) return { token: 'tok' };
        return { data: { available_courier_companies: [{ estimated_delivery_days: '3', rate: 55 }] } };
      },
    } as unknown as ResilientHttpService;

    const settings = {
      get: async (key: string) => settingsMap[key],
    } as unknown as SettingsService;

    return { provider: new ShipRocketProvider(http, settings), urls };
  }

  function serviceabilityUrl(urls: string[]): string {
    const url = urls.find((u) => u.includes('/courier/serviceability/'));
    if (!url) throw new Error('serviceability URL was not requested');
    return url;
  }

  it('uses the configured pickup PIN when set', async () => {
    const { provider, urls } = build({ 'shipping.pickupPincode': '110001' });
    await provider.checkServiceability('560100', 1000, false);
    expect(serviceabilityUrl(urls)).toContain('pickup_postcode=110001');
  });

  it('defaults to 560001 when the setting is unset', async () => {
    const { provider, urls } = build({});
    await provider.checkServiceability('560100', 1000, false);
    expect(serviceabilityUrl(urls)).toContain('pickup_postcode=560001');
  });

  it('falls back to 560001 when the setting is malformed', async () => {
    const { provider, urls } = build({ 'shipping.pickupPincode': 'not-a-pin' });
    await provider.checkServiceability('560100', 1000, false);
    expect(serviceabilityUrl(urls)).toContain('pickup_postcode=560001');
  });
});
