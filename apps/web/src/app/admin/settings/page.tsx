'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatInr, isValidGstin } from '@belzo/shared';
import { adminFetch } from '@/lib/admin-api';
import { ContentEditor } from './content-editor';
import { HomeSectionsEditor } from './home-sections-editor';
import { SmsGatewayCard } from './sms-gateway-card';
import { PickupSettingsCard } from './pickup-settings-card';
import { TrackingSettingsCard } from './tracking-settings-card';
import { TrackingServerCard } from './tracking-server-card';
import { OrderAlertsCard } from './order-alerts-card';
import { SETTINGS_TABS, settingLabel, tabFromHash, type SettingsTabKey } from './settings-tabs';

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
  { key: 'store.fssai', label: 'FSSAI licence no. (printed on the invoice for food items)', type: 'text', placeholder: '14-digit FSSAI number' },
  { key: 'store.codPaymentQr', label: 'UPI payment QR on Cash on Delivery invoices (leave empty to use the SBI QR)', type: 'text', placeholder: 'upi://pay?pa=name@bank' },
  { key: 'store.website', label: 'Website', type: 'text', placeholder: 'https://' },
  { key: 'store.logoUrl', label: 'Logo URL (https)', type: 'text', placeholder: 'https://' },
  { key: 'store.invoiceTerms', label: 'Invoice terms / return note', type: 'textarea' },
];

const EDITABLE: { key: string; label: string; type: 'text' | 'number' | 'bool'; paise?: boolean }[] = [
  { key: 'shipping.freeThresholdPaise', label: 'Free-shipping threshold (paise)', type: 'number', paise: true },
  { key: 'shipping.flatPaise', label: 'Flat shipping (paise)', type: 'number', paise: true },
  { key: 'shipping.pickupPincode', label: 'Pickup PIN code', type: 'text' },
  { key: 'shipping.defaultItemWeightGrams', label: 'Default item weight (grams)', type: 'number' },
  { key: 'payment.codEnabled', label: 'COD enabled', type: 'bool' },
  { key: 'payment.codFeePaise', label: 'COD fee (paise)', type: 'number', paise: true },
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
  const [tab, setTab] = useState<SettingsTabKey>('store');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Uncontrolled inputs take their defaultValue on first render, so the forms
  // render only after load() resolves (otherwise a blur could save '' over a stored value).
  const [loaded, setLoaded] = useState(false);
  const [gstinError, setGstinError] = useState<string | null>(null);

  async function load() {
    setSettings(await adminFetch<Settings>('/admin/settings').catch(() => ({})));
    setLoaded(true);
  }
  useEffect(() => {
    void load();
  }, []);

  // The open tab is kept in the URL (#orders, #tracking ...): a refresh or a shared link opens the same tab.
  useEffect(() => {
    const fromUrl = () => setTab(tabFromHash(window.location.hash));
    fromUrl();
    window.addEventListener('hashchange', fromUrl);
    return () => window.removeEventListener('hashchange', fromUrl);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  function openTab(next: SettingsTabKey) {
    setTab(next);
    window.history.replaceState(null, '', `#${next}`);
  }
  /** A short "Saved" note in the corner, so it is seen wherever on the page the change was made. */
  function notify(text: string) {
    setMsg(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMsg(null), 4000);
  }
  async function save(key: string, value: unknown) {
    await adminFetch('/admin/settings', { method: 'PUT', body: { key, value } });
    notify(`${settingLabel(key)} saved.`);
    setSettings((s) => ({ ...s, [key]: value }));
  }

  const activeTheme = settings.theme === 'emart' ? 'emart' : 'classic';
  const openTabInfo = SETTINGS_TABS.find((t) => t.key === tab) ?? SETTINGS_TABS[0]!;
  /** Cards that read their values from the loaded settings wait for them (a blur must never save an empty box). */
  const whenLoaded = (children: ReactNode) =>
    loaded ? children : <p className="admin-muted" data-testid="settings-loading">Loading settings…</p>;
  // Every tab stays mounted and only the open one is shown, so half-typed changes survive a tab switch.
  const pane = (key: SettingsTabKey, children: ReactNode) => (
    <div role="tabpanel" id={`set-panel-${key}`} aria-labelledby={`set-tab-${key}`} hidden={tab !== key} className="set-panel" data-testid={`settings-panel-${key}`}>
      {children}
    </div>
  );
  return (
    <div data-testid="admin-settings">
      <h1>Settings</h1>
      <div className="set-tabs" role="tablist" aria-label="Settings sections" data-testid="settings-tabs">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`set-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`set-panel-${t.key}`}
            className={`set-tab${tab === t.key ? ' is-on' : ''}`}
            onClick={() => openTab(t.key)}
            data-testid={`settings-tab-${t.key}`}
          >
            <span aria-hidden>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>
      <p className="set-blurb" data-testid="settings-blurb">{openTabInfo.blurb}</p>
      {msg && (
        <p role="status" className="set-toast" data-testid="settings-msg">
          ✓ {msg}
        </p>
      )}

      {pane('store', whenLoaded(
        <>
      <div className="admin-form" data-testid="invoice-settings">
        <h2>Store &amp; invoice details</h2>
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          Shown on GST tax invoices. Use &lsquo;Regenerate invoice&rsquo; on an order to update an existing invoice.
        </p>
        {INVOICE_FIELDS.map((f) => {
          const current = settings[f.key];
          const initial = current === undefined || current === null ? '' : String(current);
          const isGstin = f.key === 'store.gstin';
          const onBlur = (value: string) => {
            const next = value.trim();
            // A mistyped GSTIN would print as-is on every invoice; blank = not registered.
            if (isGstin) {
              if (next && !isValidGstin(next)) {
                setGstinError('Enter a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5), or leave blank. Not saved.');
                return;
              }
              setGstinError(null);
            }
            if (next !== initial.trim()) void save(f.key, next);
          };
          const id = `setting-input-${f.key}`;
          const errorId = `${id}-error`;
          const showError = isGstin && gstinError !== null;
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
                  aria-invalid={showError || undefined}
                  aria-describedby={showError ? errorId : undefined}
                  data-testid={`setting-${f.key}`}
                />
              )}
              {showError && (
                <p id={errorId} role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
                  {gstinError}
                </p>
              )}
            </div>
          );
        })}
      </div>

        </>,
      ))}

      {pane('orders', whenLoaded(
        <>
          <PickupSettingsCard settings={settings} onSave={save} />
      <div className="admin-form">
        <h2>Shipping &amp; payment</h2>
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          Amounts are in paise (100 paise = ₹1); the rupee value is shown under each box. Changes save when you click away or tick the box.
        </p>
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
              {f.paise && current !== undefined && current !== null && current !== '' && Number.isFinite(Number(current)) && (
                <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '0.2rem 0 0' }} data-testid={`rupees-${f.key}`}>
                  = {formatInr(Number(current))}
                </p>
              )}
            </div>
          );
        })}
        <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Every change is saved to the audit log.</p>
      </div>
        </>,
      ))}

      {pane('storefront', (
        <>
      <section className="admin-form" style={{ maxWidth: 'none' }}>
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
        </>
      ))}

      {pane('notifications', (
        <>
          {whenLoaded(<OrderAlertsCard settings={settings} onSave={save} />)}
          <SmsGatewayCard />
        </>
      ))}

      {pane('tracking', whenLoaded(
        <>
          <TrackingSettingsCard settings={settings} onSave={save} />
          <TrackingServerCard settings={settings} />
        </>,
      ))}
    </div>
  );
}
