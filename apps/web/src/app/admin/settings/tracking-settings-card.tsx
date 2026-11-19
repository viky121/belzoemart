'use client';

import { useState } from 'react';
import { TRACKING_SETTING_KEY, extractGa4Id, extractMetaPixelId, sanitizeTracking } from '@belzo/shared';

interface Props {
  settings: Record<string, unknown>;
  /** Saves one setting (the settings page audits and stores it). */
  onSave: (key: string, value: unknown) => void | Promise<void>;
}

const hint = { color: '#64748b', fontSize: '0.85rem', margin: '0.25rem 0 0' } as const;

/** What the box holds → what will be saved, and an error when something was typed that has no valid ID. */
function resolve(text: string, extract: (s: string) => string): { id: string; error: string | null } {
  const id = extract(text);
  if (text.trim() !== '' && id === '') return { id: '', error: 'No valid ID found in what you pasted.' };
  return { id, error: null };
}

/**
 * Admin Settings: Tracking. Paste the Google Analytics 4 and Meta (Facebook) Pixel code, or just the ID. Only
 * the ID is kept; the site builds the tracking code itself and adds it to every storefront page (not the admin
 * panel). Leave a box empty to switch that tracker off.
 */
export function TrackingSettingsCard({ settings, onSave }: Props) {
  const saved = sanitizeTracking(settings[TRACKING_SETTING_KEY]);
  const [ga, setGa] = useState(saved.ga4Id);
  const [pixel, setPixel] = useState(saved.metaPixelId);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const gaRes = resolve(ga, extractGa4Id);
  const pixelRes = resolve(pixel, extractMetaPixelId);
  const invalid = gaRes.error !== null || pixelRes.error !== null;
  const unchanged = gaRes.id === saved.ga4Id && pixelRes.id === saved.metaPixelId;

  async function save() {
    if (invalid || busy) return;
    setBusy(true);
    setDone(null);
    setFailed(null);
    try {
      await onSave(TRACKING_SETTING_KEY, { ga4Id: gaRes.id, metaPixelId: pixelRes.id });
      // Show the cleaned IDs (a pasted snippet becomes just its ID).
      setGa(gaRes.id);
      setPixel(pixelRes.id);
      setDone('Saved. The storefront uses these from the next page load.');
    } catch {
      setFailed('Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-form" data-testid="tracking-settings">
      <h2>Tracking (Google Analytics &amp; Facebook Pixel)</h2>
      <p style={{ ...hint, margin: '0 0 0.75rem' }}>
        Paste the code Google or Meta gave you, or just the ID. Only the ID is saved; the site adds the tracking to every customer page
        (not to this admin panel). Orders, add-to-cart, checkout and product views are sent automatically. Leave a box empty to turn it off.
      </p>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="tracking-ga4">Google Analytics 4 (Measurement ID or gtag code)</label>
        <textarea
          id="tracking-ga4"
          rows={3}
          maxLength={4000}
          value={ga}
          placeholder="G-XXXXXXXXXX"
          onChange={(e) => setGa(e.target.value)}
          data-testid="tracking-ga4"
        />
        {gaRes.error ? (
          <p role="alert" style={{ ...hint, color: '#b91c1c' }}>
            {gaRes.error} It looks like G-XXXXXXXXXX (GA4 → Admin → Data streams).
          </p>
        ) : (
          <p style={hint} data-testid="tracking-ga4-detected">
            {gaRes.id ? `Will use: ${gaRes.id}` : 'Not set (Google Analytics is off).'}
          </p>
        )}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="tracking-pixel">Facebook / Meta Pixel (Pixel ID or pixel code)</label>
        <textarea
          id="tracking-pixel"
          rows={3}
          maxLength={8000}
          value={pixel}
          placeholder="1234567890123456"
          onChange={(e) => setPixel(e.target.value)}
          data-testid="tracking-pixel"
        />
        {pixelRes.error ? (
          <p role="alert" style={{ ...hint, color: '#b91c1c' }}>
            {pixelRes.error} It is a 15 to 16 digit number (Meta Events Manager → Data sources).
          </p>
        ) : (
          <p style={hint} data-testid="tracking-pixel-detected">
            {pixelRes.id ? `Will use: ${pixelRes.id}` : 'Not set (Meta Pixel is off).'}
          </p>
        )}
      </div>

      <button type="button" className="auth-btn" disabled={busy || invalid || unchanged} onClick={() => void save()} data-testid="tracking-save">
        {busy ? 'Saving…' : 'Save tracking'}
      </button>
      {done && (
        <p role="status" style={{ ...hint, color: '#15803d' }} data-testid="tracking-done">
          {done}
        </p>
      )}
      {failed && (
        <p role="alert" style={{ ...hint, color: '#b91c1c' }}>
          {failed}
        </p>
      )}
    </div>
  );
}
