'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { ContentEditor } from './content-editor';

type Settings = Record<string, unknown>;

const EDITABLE: { key: string; label: string; type: 'text' | 'number' | 'bool' }[] = [
  { key: 'store.name', label: 'Store name', type: 'text' },
  { key: 'store.gstin', label: 'GSTIN', type: 'text' },
  { key: 'store.state', label: 'Seller state (for GST)', type: 'text' },
  { key: 'shipping.freeThresholdPaise', label: 'Free-shipping threshold (paise)', type: 'number' },
  { key: 'shipping.flatPaise', label: 'Flat shipping (paise)', type: 'number' },
  { key: 'shipping.pickupPincode', label: 'Pickup PIN code', type: 'text' },
  { key: 'shipping.defaultItemWeightGrams', label: 'Default item weight (grams)', type: 'number' },
  { key: 'payment.codEnabled', label: 'COD enabled', type: 'bool' },
  { key: 'payment.codFeePaise', label: 'COD fee (paise)', type: 'number' },
];

const THEMES: { value: string; name: string; desc: string; icon: string }[] = [
  {
    value: 'classic',
    name: 'Classic',
    desc: 'Flipkart-style marketplace: blue header, category strip, deal rails.',
    icon: '🛍️',
  },
  {
    value: 'emart',
    name: 'eMart',
    desc: 'Grocery / FMCG look: green header, shop-by-category tiles, promo banners.',
    icon: '🛒',
  },
];

/** Admin store settings (FR-13.2-13.4) + storefront theme selection. */
export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setSettings(await adminFetch<Settings>('/admin/settings').catch(() => ({})));
  }
  useEffect(() => {
    void load();
  }, []);

  async function save(key: string, value: unknown) {
    await adminFetch('/admin/settings', { method: 'PUT', body: { key, value } });
    setMsg(`Saved ${key}.`);
    setSettings((s) => ({ ...s, [key]: value }));
  }

  const activeTheme = settings.theme === 'emart' ? 'emart' : 'classic';

  return (
    <div data-testid="admin-settings">
      <h1>Settings</h1>
      {msg && <p role="status" data-testid="settings-msg">{msg}</p>}

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.25rem' }}>Storefront theme</h2>
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          The selected theme is applied to the customer-facing storefront (header, home page and
          palette).
        </p>
        <div className="theme-picker" data-testid="theme-picker">
          {THEMES.map((th) => {
            const on = activeTheme === th.value;
            return (
              <button
                key={th.value}
                type="button"
                className={`theme-card${on ? ' theme-card--on' : ''}`}
                onClick={() => save('theme', th.value)}
                data-testid={`theme-option-${th.value}`}
                aria-pressed={on}
              >
                <span className="theme-card__icon">{th.icon}</span>
                <span className="theme-card__body">
                  <strong>
                    {th.name}
                    {on && <span className="theme-card__badge">Default</span>}
                  </strong>
                  <span>{th.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <ContentEditor />

      <div className="admin-form">
        <h2>Store settings</h2>
        {EDITABLE.map((f) => {
          const current = settings[f.key];
          return (
            <div key={f.key} style={{ marginBottom: '0.75rem' }}>
              <label>{f.label}</label>
              {f.type === 'bool' ? (
                <input
                  type="checkbox"
                  checked={Boolean(current)}
                  onChange={(e) => save(f.key, e.target.checked)}
                  data-testid={`setting-${f.key}`}
                />
              ) : (
                <input
                  type={f.type === 'number' ? 'number' : 'text'}
                  defaultValue={current === undefined || current === null ? '' : String(current)}
                  onBlur={(e) => save(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                  data-testid={`setting-${f.key}`}
                />
              )}
            </div>
          );
        })}
        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Changes save on blur / toggle and are audit-logged.</p>
      </div>
    </div>
  );
}
