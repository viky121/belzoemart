'use client';

import { useCallback, useEffect, useState } from 'react';
import { TRACKING_SETTING_KEY } from '@belzo/shared';
import { adminFetch } from '@/lib/admin-api';

interface Status {
  ga4: { measurementId: string; secretConfigured: boolean; secretHint: string };
  meta: { pixelId: string; tokenConfigured: boolean; tokenHint: string; testEventCode: string };
  ready: { ga4: boolean; meta: boolean };
  updatedAt: string | null;
  unreadable: boolean;
}

const hint = { color: '#64748b', fontSize: '0.85rem', margin: '0.25rem 0 0' } as const;
const ok = { ...hint, color: '#15803d' } as const;
const warn = { ...hint, color: '#b45309' } as const;
const bad = { ...hint, color: '#b91c1c' } as const;

function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

interface Props {
  /** The settings loaded by the page; used to refresh this card when the IDs above change. */
  settings: Record<string, unknown>;
}

/**
 * Admin Settings: Mobile app tracking. The app cannot run Google's or Meta's browser code, so it sends its events
 * to our server, which forwards them to Google Analytics 4 and Meta. That needs two server-side secrets (GA4 API
 * secret, Meta access token). They are write-only: once saved they are never shown again, only their last 4 characters.
 */
export function TrackingServerCard({ settings }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [ga, setGa] = useState('');
  const [token, setToken] = useState('');
  const [code, setCode] = useState<string | null>(null); // null = untouched
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null);
  const [msg, setMsg] = useState<{ text: string; good: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await adminFetch<Status>('/admin/tracking/server'));
    } catch (e) {
      setMsg({ text: errText(e, 'Could not load the mobile app tracking status.'), good: false });
    }
  }, []);

  // Refresh when the IDs saved in the Tracking card above change (they decide whether a channel is ready).
  const idsKey = JSON.stringify(settings[TRACKING_SETTING_KEY] ?? null);
  useEffect(() => {
    void load();
  }, [load, idsKey]);

  const codeValue = code ?? status?.meta.testEventCode ?? '';
  const dirty = ga.trim() !== '' || token.trim() !== '' || (code !== null && code.trim() !== (status?.meta.testEventCode ?? ''));

  async function save() {
    if (!dirty || busy) return;
    setBusy('save');
    setMsg(null);
    try {
      const body: Record<string, string> = {};
      if (ga.trim()) body.ga4ApiSecret = ga.trim();
      if (token.trim()) body.metaAccessToken = token.trim();
      if (code !== null && code.trim() !== (status?.meta.testEventCode ?? '')) body.metaTestEventCode = code.trim();
      setStatus(await adminFetch<Status>('/admin/tracking/server', { method: 'PUT', body }));
      setGa('');
      setToken('');
      setCode(null);
      setMsg({ text: 'Saved. The app picks this up within a couple of minutes.', good: true });
    } catch (e) {
      setMsg({ text: errText(e, 'Could not save. Check the values and try again.'), good: false });
    } finally {
      setBusy(null);
    }
  }

  async function remove(field: 'ga4ApiSecret' | 'metaAccessToken') {
    if (busy) return;
    setBusy('remove');
    setMsg(null);
    try {
      setStatus(await adminFetch<Status>('/admin/tracking/server', { method: 'PUT', body: { [field]: '' } }));
      setMsg({ text: 'Removed.', good: true });
    } catch (e) {
      setMsg({ text: errText(e, 'Could not remove it.'), good: false });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    if (busy) return;
    setBusy('test');
    setMsg(null);
    try {
      const r = await adminFetch<{ ok: boolean; message: string }>('/admin/tracking/server/test', { method: 'POST' });
      setMsg({ text: r.message, good: r.ok });
    } catch (e) {
      setMsg({ text: errText(e, 'Could not run the test.'), good: false });
    } finally {
      setBusy(null);
    }
  }

  const channel = (label: string, ready: boolean, hasId: boolean, hasSecret: boolean) => (
    <p style={ready ? ok : warn} data-testid={`tracking-server-${label.toLowerCase()}-ready`}>
      {label}: {ready ? 'ready, the app sends its events' : !hasId ? 'not set up (save the ID in the Tracking card above)' : !hasSecret ? 'waiting for the secret below' : 'not ready'}
    </p>
  );

  return (
    <div className="admin-form" data-testid="tracking-server">
      <h2>Mobile app tracking (server-side)</h2>
      <p style={{ ...hint, margin: '0 0 0.75rem' }}>
        The app sends product views, add to cart, checkout and purchases to our server, which passes them to Google Analytics and Meta. This
        needs the ID from the Tracking card above plus the secret for each. Secrets are saved encrypted and are never shown again.
      </p>

      {status && (
        <div style={{ marginBottom: '0.75rem' }}>
          {channel('Google Analytics', status.ready.ga4, Boolean(status.ga4.measurementId), status.ga4.secretConfigured)}
          {channel('Meta', status.ready.meta, Boolean(status.meta.pixelId), status.meta.tokenConfigured)}
          {status.unreadable && (
            <p role="alert" style={bad}>
              A saved secret could not be read. Please enter it again.
            </p>
          )}
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="trk-ga-secret">Google Analytics API secret</label>
        <input
          id="trk-ga-secret"
          type="password"
          autoComplete="off"
          value={ga}
          maxLength={120}
          placeholder={status?.ga4.secretConfigured ? `Saved (${status.ga4.secretHint}). Type a new one to replace it.` : 'GA4 → Admin → Data streams → Measurement Protocol API secrets'}
          onChange={(e) => setGa(e.target.value)}
          data-testid="tracking-ga-secret"
        />
        {status?.ga4.secretConfigured && (
          <button type="button" className="mh-link-btn" disabled={busy !== null} onClick={() => void remove('ga4ApiSecret')}>
            Remove
          </button>
        )}
        <p style={hint}>Google cannot check this secret for us. After saving, open GA4 → Reports → Realtime and use the app once.</p>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="trk-meta-token">Meta (Facebook) Conversions API access token</label>
        <input
          id="trk-meta-token"
          type="password"
          autoComplete="off"
          value={token}
          maxLength={700}
          placeholder={status?.meta.tokenConfigured ? `Saved (${status.meta.tokenHint}). Type a new one to replace it.` : 'Events Manager → your pixel → Settings → Conversions API → Generate access token'}
          onChange={(e) => setToken(e.target.value)}
          data-testid="tracking-meta-token"
        />
        {status?.meta.tokenConfigured && (
          <button type="button" className="mh-link-btn" disabled={busy !== null} onClick={() => void remove('metaAccessToken')}>
            Remove
          </button>
        )}
        <p style={hint}>Meta checks the token against your pixel when you save, so a wrong one is refused.</p>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="trk-meta-test">Meta test event code (optional)</label>
        <input
          id="trk-meta-test"
          type="text"
          autoComplete="off"
          value={codeValue}
          maxLength={40}
          placeholder="TEST12345"
          onChange={(e) => setCode(e.target.value)}
          data-testid="tracking-meta-test-code"
        />
        {codeValue.trim() !== '' ? (
          <p style={warn} data-testid="tracking-test-mode">
            Test mode is ON: events reach only Meta&apos;s Test events tab and are NOT counted in your live reports or ads. Clear this box and save to go live.
          </p>
        ) : (
          <p style={hint}>To try it first, paste the code from Events Manager → Test events, save, then press &quot;Send test event&quot;.</p>
        )}
      </div>

      <button type="button" className="auth-btn" disabled={busy !== null || !dirty} onClick={() => void save()} data-testid="tracking-server-save">
        {busy === 'save' ? 'Saving…' : 'Save'}
      </button>{' '}
      <button
        type="button"
        className="mh-link-btn"
        disabled={busy !== null || !status?.meta.tokenConfigured || !status?.meta.testEventCode}
        onClick={() => void test()}
        data-testid="tracking-server-test"
      >
        {busy === 'test' ? 'Sending…' : 'Send test event to Meta'}
      </button>
      {msg && (
        <p role={msg.good ? 'status' : 'alert'} style={msg.good ? ok : bad} data-testid="tracking-server-msg">
          {msg.text}
        </p>
      )}
    </div>
  );
}
