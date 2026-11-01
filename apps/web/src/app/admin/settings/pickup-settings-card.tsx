'use client';

import { PICKUP_SETTING_KEYS, normalizePickupConfig, parseHHMM } from '@belzo/shared';

const SLOT_CHOICES = [15, 30, 45, 60, 90, 120];

interface Props {
  settings: Record<string, unknown>;
  /** Saves one setting (the settings page audits and stores it). */
  onSave: (key: string, value: unknown) => void | Promise<void>;
}

/**
 * Admin Settings: Self pickup. The switch, the shop's opening and closing time, the length of one pickup
 * slot, and a note shown to the customer. The shop address itself is the one under "Store & invoice details".
 * Pickup is ON until the shop switches it off.
 */
export function PickupSettingsCard({ settings, onSave }: Props) {
  const raw = {
    enabled: settings[PICKUP_SETTING_KEYS.enabled],
    openTime: settings[PICKUP_SETTING_KEYS.openTime],
    closeTime: settings[PICKUP_SETTING_KEYS.closeTime],
    slotMinutes: settings[PICKUP_SETTING_KEYS.slotMinutes],
    note: settings[PICKUP_SETTING_KEYS.note],
  };
  const cfg = normalizePickupConfig(raw);
  // The saved hours are used as typed unless they leave no room for one slot; then the default hours apply.
  const hoursIgnored =
    parseHHMM(raw.openTime) !== null &&
    parseHHMM(raw.closeTime) !== null &&
    (cfg.openTime !== String(raw.openTime).padStart(5, '0') || cfg.closeTime !== String(raw.closeTime).padStart(5, '0'));

  return (
    <div className="admin-form" data-testid="pickup-settings">
      <h2>Self pickup</h2>
      <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
        Customers can choose to collect their order from the shop (the address is under Store &amp; invoice details). They pick a day and a
        time slot; today only slots that start at least 2 hours from now are shown. Times are India time.
      </p>
      <div style={{ marginBottom: '0.75rem' }}>
        <label>
          <input
            type="checkbox"
            defaultChecked={cfg.enabled}
            onChange={(e) => void onSave(PICKUP_SETTING_KEYS.enabled, e.target.checked)}
            data-testid="setting-pickup.enabled"
          />{' '}
          Self pickup is available at checkout
        </label>
      </div>
      <div style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="pickup-open">Opening time</label>
        <input
          id="pickup-open"
          type="time"
          defaultValue={cfg.openTime}
          onBlur={(e) => {
            if (parseHHMM(e.target.value) !== null && e.target.value !== cfg.openTime) void onSave(PICKUP_SETTING_KEYS.openTime, e.target.value);
          }}
          data-testid="setting-pickup.openTime"
        />
      </div>
      <div style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="pickup-close">Closing time (the last slot must end by this time)</label>
        <input
          id="pickup-close"
          type="time"
          defaultValue={cfg.closeTime}
          onBlur={(e) => {
            if (parseHHMM(e.target.value) !== null && e.target.value !== cfg.closeTime) void onSave(PICKUP_SETTING_KEYS.closeTime, e.target.value);
          }}
          data-testid="setting-pickup.closeTime"
        />
      </div>
      {hoursIgnored && (
        <p role="alert" style={{ color: '#b45309', fontSize: '0.85rem', margin: '0 0 0.75rem' }} data-testid="pickup-hours-warning">
          These hours leave no room for one slot, so customers see the default hours ({cfg.openTime} to {cfg.closeTime}) until you fix them.
        </p>
      )}
      <div style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="pickup-slot">Length of one slot</label>
        <select
          id="pickup-slot"
          defaultValue={String(cfg.slotMinutes)}
          onChange={(e) => void onSave(PICKUP_SETTING_KEYS.slotMinutes, Number(e.target.value))}
          data-testid="setting-pickup.slotMinutes"
        >
          {SLOT_CHOICES.map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="pickup-note">Pickup timings / note shown to the customer</label>
        <textarea
          id="pickup-note"
          rows={3}
          maxLength={300}
          defaultValue={cfg.note ?? ''}
          placeholder="Open every day 10 am to 8 pm. Ask at the counter."
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== (cfg.note ?? '')) void onSave(PICKUP_SETTING_KEYS.note, next);
          }}
          data-testid="setting-pickup.note"
        />
      </div>
    </div>
  );
}
