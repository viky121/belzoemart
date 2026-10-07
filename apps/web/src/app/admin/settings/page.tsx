'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { ContentEditor } from './content-editor';
import { HomeSectionsEditor } from './home-sections-editor';

type Settings = Record<string, unknown>;

/** Store identity printed on GST tax invoices (read by the API invoice renderer). */
const INVOICE_FIELDS: { key: string; label: string; type: 'text' | 'textarea'; placeholder?: string }[] = [
  { key: 'store.name', label: 'Store / trade name', type: 'text', placeholder: 'Belzo eMart' },
  { key: 'store.legalName', label: 'Legal business name', type: 'text' },
  { key: 'store.gstin', label: 'GSTIN (leave blank if not registered)', type: 'text', placeholder: '29ABCDE1234F1Z5' },
  { key: 'store.address', label: 'Registered address', type: 'textarea' },
  { key: 'store.city', label: 'City', type: 'text' },
  { key: 'store.state', label: 'State (used for GST, e.g. Karnataka)', type: 'text', placeholder: 'Karnataka' },
  { key: 'store.pincode', label: 'PIN code', type: 'text' },
  { key: 'store.phone', label: 'Phone', type: 'text' },
  { key: 'store.email', label: 'Email', type: 'text' },
  { key: 'store.website', label: 'Website', type: 'text', placeholder: 'https://' },
  { key: 'store.logoUrl', label: 'Logo URL (https)', type: 'text', placeholder: 'https://' },
  { key: 'store.invoiceTerms', label: 'Invoice terms / return note', type: 'textarea' },
];

const EDITABLE: { key: string; label: string; type: 'text' | 'number' | 'bool' }[] = [
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
  // Uncontrolled inputs take their defaultValue on first render, so the forms
  // render only after load() resolves (otherwise a blur could save '' over a stored value).
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setSettings(await adminFetch<Settings>('/admin/settings').catch(() => ({})));
    setLoaded(true);
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

      <HomeSectionsEditor />

      {!loaded ? (
        <p className="admin-muted" data-testid="settings-loading">Loading settings…</p>
      ) : (
      <>
      <div className="admin-form" data-testid="invoice-settings">
        <h2>Store &amp; invoice details</h2>
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          Shown on GST tax invoices. Use &lsquo;Regenerate invoice&rsquo; on an order to update an existing invoice.
        </p>
        {INVOICE_FIELDS.map((f) => {
          const current = settings[f.key];
          const initial = current === undefined || current === null ? '' : String(current);
          const onBlur = (value: string) => {
            const next = value.trim();
            if (next !== initial.trim()) void save(f.key, next);
          };
          const id = `setting-input-${f.key}`;
          return (
            <div key={f.key} style={{ marginBottom: '0.75rem' }}>
              <label htmlFor={id}>{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea
                  id={id}
                  rows={3}
                  defaultValue={initial}
                  placeholder={f.placeholder}
                  onBlur={(e) => onBlur(e.target.value)}
                  data-testid={`setting-${f.key}`}
                />
              ) : (
                <input
                  id={id}
                  type="text"
                  defaultValue={initial}
                  placeholder={f.placeholder}
                  onBlur={(e) => onBlur(e.target.value)}
                  data-testid={`setting-${f.key}`}
                />
              )}
            </div>
          );
        })}
      </div>

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
                  onBlur={(e) => {
                    // Skip no-op saves (avoids audit noise and overwriting with an unchanged value).
                    if (e.target.value === String(current ?? '')) return;
                    void save(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value);
                  }}
                  data-testid={`setting-${f.key}`}
                />
              )}
            </div>
          );
        })}
        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Changes save on blur / toggle and are audit-logged.</p>
      </div>
      </>
      )}
    </div>
  );
}
