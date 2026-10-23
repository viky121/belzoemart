import { DEFAULT_DELIVERY_SETTINGS } from '@belzo/shared';
import { DeliverySettingsService } from './delivery-settings.service';
import type { SettingsService } from '../../admin/settings.service';

function build(stored: Record<string, unknown> = {}) {
  const writes: { actor: string; key: string; value: unknown }[] = [];
  const settings = {
    get: async (key: string) => (key in stored ? stored[key] : null),
    set: async (actor: string, key: string, value: unknown) => {
      writes.push({ actor, key, value });
      stored[key] = value;
    },
  } as unknown as SettingsService;
  return { service: new DeliverySettingsService(settings), writes, stored };
}

describe('DeliverySettingsService', () => {
  it('returns the defaults when nothing is stored', async () => {
    const { service } = build();
    expect(await service.get()).toEqual(DEFAULT_DELIVERY_SETTINGS);
  });

  it('reads stored values and ignores bad ones', async () => {
    const { service } = build({
      'delivery.maxAttempts': 5,
      'delivery.acceptTimeoutMinutes': 'soon',
      'delivery.otpMaxSends': 0,
    });
    const s = await service.get();
    expect(s.maxAttempts).toBe(5);
    expect(s.acceptTimeoutMinutes).toBe(15);
    expect(s.otpMaxSends).toBe(5);
  });

  it('writes only the keys in the patch, under the delivery. prefix, with the actor', async () => {
    const { service, writes } = build();
    const updated = await service.update('admin-1', { maxAttempts: 4, trackingDays: 60 });
    expect(writes).toEqual([
      { actor: 'admin-1', key: 'delivery.maxAttempts', value: 4 },
      { actor: 'admin-1', key: 'delivery.trackingDays', value: 60 },
    ]);
    expect(updated.maxAttempts).toBe(4);
    expect(updated.trackingDays).toBe(60);
    expect(updated.acceptTimeoutMinutes).toBe(15);
  });
});
