import type { SettingsService } from '../admin/settings.service';
import { PickupController } from './pickup.controller';
import { PickupService } from './pickup.service';

function make(map: Record<string, unknown> = {}) {
  return new PickupService({ get: async (k: string) => map[k] } as unknown as SettingsService);
}

describe('PickupService', () => {
  it('uses the default hours and is on when nothing is set; the shop name falls back to Belzo eMart', async () => {
    const info = await make().info(new Date('2026-10-31T04:30:00.000Z'));
    expect(info.enabled).toBe(true);
    expect(info.note).toBeNull();
    expect(info.shop).toEqual({ name: 'Belzo eMart', address: null, city: null, state: null, pincode: null, phone: null });
    expect(info.days.map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Mon, 2 Nov']);
    expect(info.days[1]!.slots[0]!.label).toBe('10:00 AM - 11:00 AM');
  });

  it('reads the shop address from the store settings and the note and hours from the pickup settings', async () => {
    const svc = make({
      'store.name': 'Belzo eMart',
      'store.address': ' Brahman colony, Kunvar Pura Road ',
      'store.city': 'Tikamgarh',
      'store.state': 'Madhya Pradesh',
      'store.pincode': '472001',
      'store.phone': '8839095625',
      'pickup.note': 'Open every day, ask at the counter',
      'pickup.openTime': '09:00',
      'pickup.closeTime': '13:00',
      'pickup.slotMinutes': 30,
    });
    const info = await svc.info(new Date('2026-10-31T04:30:00.000Z'));
    expect(info.shop).toMatchObject({ address: 'Brahman colony, Kunvar Pura Road', city: 'Tikamgarh', pincode: '472001', phone: '8839095625' });
    expect(info.note).toBe('Open every day, ask at the counter');
    expect(info.days[1]!.slots).toHaveLength(8);
    expect(info.days[1]!.slots[0]!.label).toBe('9:00 AM - 9:30 AM');
  });

  it('when switched off, shows no slots but still gives the shop address, and refuses to resolve a slot', async () => {
    const svc = make({ 'pickup.enabled': false, 'store.address': 'Main road' });
    const info = await svc.info();
    expect(info).toMatchObject({ enabled: false, days: [], shop: { address: 'Main road' } });
    await expect(svc.assertEnabled()).rejects.toThrow(/not available/);
    await expect(svc.resolveSlot('2026-11-01T04:30:00.000Z')).rejects.toThrow(/not available/);
  });

  it('resolveSlot gives back the offered slot, and refuses a missing, off-grid or too-soon time', async () => {
    const svc = make();
    const now = new Date('2026-10-31T04:30:00.000Z');
    await expect(svc.resolveSlot('2026-11-01T04:30:00.000Z', now)).resolves.toMatchObject({ label: '10:00 AM - 11:00 AM' });
    await expect(svc.resolveSlot(undefined, now)).rejects.toThrow(/choose a pickup day and time/);
    await expect(svc.resolveSlot('2026-11-01T04:45:00.000Z', now)).rejects.toThrow(/no longer available/);
    await expect(svc.resolveSlot('2026-10-31T05:30:00.000Z', now)).rejects.toThrow(/no longer available/);
  });

  it('the controller returns the same information without any login', async () => {
    const svc = make({ 'store.address': 'Main road' });
    const out = await new PickupController(svc).info();
    expect(out.shop.address).toBe('Main road');
    expect(out.enabled).toBe(true);
  });
});
