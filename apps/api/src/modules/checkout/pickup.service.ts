import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PICKUP_SETTING_KEYS,
  buildPickupDays,
  findOfferedSlot,
  normalizePickupConfig,
  type PickupConfig,
  type PickupInfo,
  type PickupSlot,
} from '@belzo/shared';
import { SettingsService } from '../admin/settings.service';

/**
 * Self pickup (the customer collects the order from the shop): the shop's pickup settings, the shop
 * address shown at checkout, the day/time slots on offer right now, and the check that a slot chosen by
 * a customer is really one of them. All the slot rules live in `@belzo/shared` (pickup.ts).
 */
@Injectable()
export class PickupService {
  constructor(private readonly settings: SettingsService) {}

  /** Pickup settings with defaults for anything missing or invalid. */
  async config(): Promise<PickupConfig> {
    const [enabled, openTime, closeTime, slotMinutes, note] = await Promise.all([
      this.settings.get<unknown>(PICKUP_SETTING_KEYS.enabled),
      this.settings.get<unknown>(PICKUP_SETTING_KEYS.openTime),
      this.settings.get<unknown>(PICKUP_SETTING_KEYS.closeTime),
      this.settings.get<unknown>(PICKUP_SETTING_KEYS.slotMinutes),
      this.settings.get<unknown>(PICKUP_SETTING_KEYS.note),
    ]);
    return normalizePickupConfig({ enabled, openTime, closeTime, slotMinutes, note });
  }

  /** The shop address from Settings > Store (the same fields the invoice uses). */
  async shop(): Promise<PickupInfo['shop']> {
    const [name, address, city, state, pincode, phone] = await Promise.all(
      ['store.name', 'store.address', 'store.city', 'store.state', 'store.pincode', 'store.phone'].map((k) => this.text(k)),
    );
    return {
      name: name ?? 'Belzo eMart',
      address: address ?? null,
      city: city ?? null,
      state: state ?? null,
      pincode: pincode ?? null,
      phone: phone ?? null,
    };
  }

  /** Everything the checkout needs: on/off, note, the shop address and the slots on offer at `now`. */
  async info(now: Date = new Date()): Promise<PickupInfo> {
    const [config, shop] = await Promise.all([this.config(), this.shop()]);
    return { enabled: config.enabled, note: config.note, shop, days: buildPickupDays(config, now) };
  }

  /** Refuses (400) unless pickup is on. Returns the settings. */
  async assertEnabled(): Promise<PickupConfig> {
    const config = await this.config();
    if (!config.enabled) throw new BadRequestException('Self pickup is not available right now. Please choose home delivery.');
    return config;
  }

  /**
   * The slot a customer chose, checked against the slots offered at `now`. A slot that has passed, starts
   * too soon, is too far ahead or is not on the shop's slot grid is refused with a message the customer
   * can act on.
   */
  async resolveSlot(startIso: string | undefined, now: Date = new Date()): Promise<PickupSlot> {
    const config = await this.assertEnabled();
    if (!startIso) throw new BadRequestException('Please choose a pickup day and time.');
    const slot = findOfferedSlot(buildPickupDays(config, now), startIso);
    if (!slot) throw new BadRequestException('That pickup time is no longer available. Please choose another time.');
    return slot;
  }

  private async text(key: string): Promise<string | undefined> {
    const raw = await this.settings.get<unknown>(key);
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
  }
}
