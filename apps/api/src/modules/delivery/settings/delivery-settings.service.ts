import { Injectable } from '@nestjs/common';
import {
  DELIVERY_SETTING_KEYS,
  DELIVERY_SETTING_PREFIX,
  resolveDeliverySettings,
  type DeliverySettings,
  type DeliverySettingsPatch,
} from '@belzo/shared';
import { SettingsService } from '../../admin/settings.service';

/**
 * Typed `delivery.*` settings with defaults (component C11). A missing, wrong-type or
 * out-of-range stored value falls back to its default, so a bad edit can never break delivery.
 */
@Injectable()
export class DeliverySettingsService {
  constructor(private readonly settings: SettingsService) {}

  async get(): Promise<DeliverySettings> {
    const entries = await Promise.all(
      DELIVERY_SETTING_KEYS.map(async (key) => [key, await this.settings.get<unknown>(`${DELIVERY_SETTING_PREFIX}${key}`)] as const),
    );
    return resolveDeliverySettings(Object.fromEntries(entries.map(([k, v]) => [k, v ?? undefined])));
  }

  /** Apply a validated patch (the controller checks it with `deliverySettingsPatchSchema`). Each change is audited. */
  async update(actorId: string, patch: DeliverySettingsPatch): Promise<DeliverySettings> {
    for (const key of DELIVERY_SETTING_KEYS) {
      const value = patch[key];
      if (value !== undefined) await this.settings.set(actorId, `${DELIVERY_SETTING_PREFIX}${key}`, value);
    }
    return this.get();
  }
}
