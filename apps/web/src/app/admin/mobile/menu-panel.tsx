'use client';

import { DEFAULT_MOBILE_MENU, mobileMenuSchema, type MobileMenu } from '@belzo/shared';

interface FieldDef {
  key: keyof MobileMenu;
  label: string;
  hint?: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'url' | 'textarea';
}

const GROUPS: { title: string; hint: string; fields: FieldDef[] }[] = [
  {
    title: 'Customer Care',
    hint: 'Shown when a customer taps “Customer Care”. Leave a box empty to hide that action.',
    fields: [
      { key: 'carePhone', label: 'Phone number (Call)', type: 'tel', placeholder: '8839095625' },
      {
        key: 'careWhatsappUrl',
        label: 'WhatsApp link',
        type: 'url',
        placeholder: 'https://wa.me/918839095625',
        hint: 'Format: https://wa.me/91 followed by the 10-digit number.',
      },
      { key: 'careEmail', label: 'Email', type: 'email', placeholder: 'support@yourshop.com' },
      { key: 'careHours', label: 'Support timings', placeholder: 'Mon–Sat, 9 AM – 8 PM' },
    ],
  },
  {
    title: 'Store Locator',
    hint: 'Shown when a customer taps “Store Locator”. With no address the item is hidden.',
    fields: [
      { key: 'storeName', label: 'Store name' },
      {
        key: 'storeAddress',
        label: 'Address',
        type: 'textarea',
        hint: 'One line per row, exactly as it should appear.',
      },
      {
        key: 'storeMapsUrl',
        label: 'Google Maps link',
        type: 'url',
        placeholder: 'https://maps.app.goo.gl/…',
        hint: 'Open the store in Google Maps → Share → copy link.',
      },
      { key: 'storeHours', label: 'Opening hours', placeholder: 'Daily, 8 AM – 10 PM' },
      { key: 'storeHelpline', label: 'Store helpline number', type: 'tel', hint: 'Optional. Adds a “Call store helpline” button.' },
    ],
  },
  {
    title: 'Links',
    hint: 'Used by Share, Rate Us and About. Every link must start with https://.',
    fields: [
      { key: 'website', label: 'Website', type: 'url', placeholder: 'https://belzoemart.com' },
      {
        key: 'shareUrl',
        label: 'Share link',
        type: 'url',
        hint: 'What “Share Belzo eMart” sends. Empty = the website. Use the Play Store page once the app is published.',
      },
      {
        key: 'playStoreUrl',
        label: 'Google Play link (Rate Us)',
        type: 'url',
        placeholder: 'https://play.google.com/store/apps/details?id=…',
        hint: 'Empty = “Rate Us” stays hidden on Android until the app is published.',
      },
      { key: 'appStoreUrl', label: 'Apple App Store link (Rate Us)', type: 'url', hint: 'Empty = hidden on iPhone.' },
    ],
  },
];

/** Field-level problem for the current value, or null. */
function fieldError(key: keyof MobileMenu, value: string): string | null {
  const r = mobileMenuSchema.shape[key].safeParse(value);
  return r.success ? null : (r.error.issues[0]?.message ?? 'Invalid value');
}

/**
 * Admin: contact, store and link details for the app's ☰ menu. Applies after Save, with no
 * app update. Empty boxes hide the matching menu action.
 */
export function MenuPanel({ value, onChange }: { value: MobileMenu; onChange: (next: MobileMenu) => void }) {
  const set = (key: keyof MobileMenu, v: string) => onChange({ ...value, [key]: v });

  return (
    <div data-testid="mh-menu-panel">
      <p className="prod-form__hint">
        These details fill the Customer Care, Store Locator, Share, Rate Us and About items in the app’s ☰ menu.
      </p>
      {GROUPS.map((g) => (
        <fieldset key={g.title} className="mh-menu-group" style={{ border: 0, padding: 0, margin: '18px 0 0' }}>
          <legend style={{ fontWeight: 700, fontSize: 16, padding: 0 }}>{g.title}</legend>
          <p className="prod-form__hint">{g.hint}</p>
          {g.fields.map((f) => {
            const id = `mh-menu-${f.key}`;
            const err = fieldError(f.key, value[f.key]);
            return (
              <div key={f.key} style={{ marginBottom: 12, maxWidth: 520 }}>
                <label className="auth-label" htmlFor={id}>
                  {f.label}
                </label>
                {f.type === 'textarea' ? (
                  <textarea
                    id={id}
                    className="auth-input"
                    rows={4}
                    maxLength={300}
                    value={value[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    aria-invalid={err ? true : undefined}
                  />
                ) : (
                  <input
                    id={id}
                    className="auth-input"
                    type={f.type === 'tel' || f.type === 'email' || f.type === 'url' ? f.type : 'text'}
                    value={value[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? `${id}-err` : undefined}
                  />
                )}
                {f.hint && <p className="prod-form__hint">{f.hint}</p>}
                {err && (
                  <p id={`${id}-err`} role="alert" className="prod-form__msg">
                    {err}
                  </p>
                )}
              </div>
            );
          })}
        </fieldset>
      ))}
      <button
        type="button"
        className="mh-link-btn"
        onClick={() => onChange({ ...DEFAULT_MOBILE_MENU })}
        data-testid="mh-menu-reset"
      >
        ↺ Restore the original Belzo eMart details
      </button>
    </div>
  );
}
