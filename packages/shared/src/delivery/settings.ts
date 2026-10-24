import { z } from 'zod';

/** Delivery settings stored in the `Setting` table under `delivery.<key>` (domain-entities, Settings). */
export interface DeliverySettings {
  acceptTimeoutMinutes: number;
  maxAttempts: number;
  defaultMaxActiveJobs: number;
  offlineAfterMinutes: number;
  otpValidMinutes: number;
  otpVerifiedFreshMinutes: number;
  otpMaxWrongGuesses: number;
  otpLockoutMinutes: number;
  otpResendSeconds: number;
  otpMaxSends: number;
  trackingDays: number;
}

export const DEFAULT_DELIVERY_SETTINGS: Readonly<DeliverySettings> = {
  acceptTimeoutMinutes: 15,
  maxAttempts: 3,
  defaultMaxActiveJobs: 10,
  offlineAfterMinutes: 30,
  otpValidMinutes: 240,
  otpVerifiedFreshMinutes: 30,
  otpMaxWrongGuesses: 5,
  otpLockoutMinutes: 15,
  otpResendSeconds: 60,
  otpMaxSends: 5,
  trackingDays: 30,
};

export const DELIVERY_SETTING_KEYS = Object.keys(DEFAULT_DELIVERY_SETTINGS) as (keyof DeliverySettings)[];

export const DELIVERY_SETTING_PREFIX = 'delivery.';

const int = (min: number, max: number) => z.number().int().min(min).max(max);

/** Allowed range of every setting. */
export const DELIVERY_SETTING_RANGES: Readonly<Record<keyof DeliverySettings, { min: number; max: number }>> = {
  acceptTimeoutMinutes: { min: 1, max: 240 },
  maxAttempts: { min: 1, max: 10 },
  defaultMaxActiveJobs: { min: 1, max: 100 },
  offlineAfterMinutes: { min: 1, max: 240 },
  otpValidMinutes: { min: 5, max: 1440 },
  otpVerifiedFreshMinutes: { min: 1, max: 240 },
  otpMaxWrongGuesses: { min: 1, max: 10 },
  otpLockoutMinutes: { min: 1, max: 240 },
  otpResendSeconds: { min: 10, max: 600 },
  otpMaxSends: { min: 1, max: 20 },
  trackingDays: { min: 1, max: 365 },
};

/** A partial update of the settings. Unknown keys are rejected. */
export const deliverySettingsPatchSchema = z
  .object(
    Object.fromEntries(
      DELIVERY_SETTING_KEYS.map((k) => [k, int(DELIVERY_SETTING_RANGES[k].min, DELIVERY_SETTING_RANGES[k].max).optional()]),
    ) as Record<keyof DeliverySettings, z.ZodOptional<z.ZodNumber>>,
  )
  .strict();
export type DeliverySettingsPatch = z.infer<typeof deliverySettingsPatchSchema>;

/**
 * Turn raw stored values into full settings: a missing, non-integer or out-of-range value
 * falls back to its default (BR: settings reader is forgiving, never throws).
 */
export function resolveDeliverySettings(raw: Partial<Record<keyof DeliverySettings, unknown>>): DeliverySettings {
  const out = { ...DEFAULT_DELIVERY_SETTINGS };
  for (const key of DELIVERY_SETTING_KEYS) {
    const v = raw[key];
    const { min, max } = DELIVERY_SETTING_RANGES[key];
    if (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max) out[key] = v;
  }
  return out;
}
