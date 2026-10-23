'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import {
  buildCredentialsPayload,
  changesKeyMode,
  EMPTY_FORM,
  generateWebhookSecret,
  type GatewayForm,
} from './gateway-form';

type Source = 'admin' | 'env';

interface GatewayStatus {
  mode: 'live' | 'mock';
  keyType: 'live' | 'test' | 'none';
  keyHint: string;
  secretConfigured: boolean;
  webhookSecretConfigured: boolean;
  webhookUrl: string;
  lastWebhookAt: string | null;
  openOnlineOrders: number;
  source: { keyId: Source; keySecret: Source; webhookSecret: Source };
  credentialsUpdatedAt: string | null;
  overrideUnreadable: boolean;
}

type Tone = 'ok' | 'warn' | 'bad';

function Row({ label, value, tone, note }: { label: string; value: string; tone?: Tone; note?: string }) {
  return (
    <div className="pg-row">
      <span className="pg-row__label">
        {label}
        {note ? <span className="pg-row__note"> · {note}</span> : null}
      </span>
      <span className={`pg-row__value${tone ? ` pg-row__value--${tone}` : ''}`}>{value}</span>
    </div>
  );
}

const sourceNote = (s: Source) => (s === 'admin' ? 'set here' : 'server setting');

/**
 * Razorpay setup. Shows what is configured and lets a super admin change the credentials.
 * Secrets are write-only: they are encrypted on the server and never sent back to the
 * browser, so the fields below start empty and a blank field means "keep the current one".
 * Anyone who isn't a super admin simply doesn't see this card.
 */
export function GatewayStatusCard() {
  const [s, setS] = useState<GatewayStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<GatewayForm>(EMPTY_FORM);
  const [busy, setBusy] = useState<'save' | 'test' | 'reset' | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    let cancelled = false;
    adminFetch<GatewayStatus>('/admin/payment-gateway/status')
      .then((d) => !cancelled && setS(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const set = useCallback((k: keyof GatewayForm, v: string) => setForm((f) => ({ ...f, [k]: v })), []);

  if (!s) return null;

  const live = s.mode === 'live' && s.keyType === 'live';
  const modeText =
    s.mode === 'mock'
      ? 'Test mode (no real money)'
      : s.keyType === 'live'
        ? 'Live (real payments)'
        : 'Razorpay test keys (no real money)';
  const webhookText = s.lastWebhookAt
    ? `Receiving (last: ${new Date(s.lastWebhookAt).toLocaleString('en-IN')})`
    : 'Not received yet. Add the webhook in the Razorpay dashboard.';
  const hasSavedHere = Object.values(s.source).includes('admin');

  function errText(e: unknown, fallback: string): string {
    return e instanceof Error && e.message ? e.message : fallback;
  }

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* clipboard unavailable: the text stays visible to select */
    }
  }

  async function save() {
    setMsg(null);
    const built = buildCredentialsPayload(form);
    if ('error' in built) {
      setMsg({ text: built.error, ok: false });
      return;
    }
    if (built.payload.keyId && changesKeyMode(s!.keyType, built.payload.keyId)) {
      const to = built.payload.keyId.startsWith('rzp_live_') ? 'LIVE (real money)' : 'TEST (no real money)';
      if (!window.confirm(`These keys switch payments to ${to}. Continue?`)) return;
    }
    if (built.payload.webhookSecret && !window.confirm('Razorpay must use the same webhook secret, or payment webhooks will be rejected. Continue?')) {
      return;
    }
    setBusy('save');
    try {
      const next = await adminFetch<GatewayStatus>('/admin/payment-gateway/credentials', {
        method: 'PUT',
        body: built.payload,
      });
      setS(next);
      setForm(EMPTY_FORM);
      setEditing(false);
      setShowSecrets(false);
      setMsg({ text: 'Saved. The new credentials are in use now.', ok: true });
    } catch (e) {
      setMsg({ text: errText(e, 'Could not save. Check the values and try again.'), ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy('test');
    setMsg(null);
    try {
      const r = await adminFetch<{ ok: boolean; message: string }>('/admin/payment-gateway/test', { method: 'POST' });
      setMsg({ text: r.message, ok: r.ok });
    } catch (e) {
      setMsg({ text: errText(e, 'Could not run the check.'), ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!window.confirm('Remove the credentials saved here and go back to the server settings?')) return;
    setBusy('reset');
    setMsg(null);
    try {
      setS(await adminFetch<GatewayStatus>('/admin/payment-gateway/credentials', { method: 'DELETE' }));
      setMsg({ text: 'Now using the server settings.', ok: true });
    } catch (e) {
      setMsg({ text: errText(e, 'Could not reset.'), ok: false });
    } finally {
      setBusy(null);
    }
  }

  const inputType = showSecrets ? 'text' : 'password';

  return (
    <section className="admin-card pg-card" data-testid="gateway-status">
      <div className="pg-head">
        <h2>Payment gateway (Razorpay)</h2>
        {!editing && (
          <button type="button" className="auth-btn pg-edit" onClick={() => setEditing(true)} data-testid="gateway-edit">
            Edit
          </button>
        )}
      </div>

      <Row label="Mode" value={modeText} tone={live ? 'ok' : 'warn'} />
      <Row
        label="API key"
        value={s.keyHint || 'Not set'}
        tone={s.keyHint ? 'ok' : 'bad'}
        note={s.keyHint ? sourceNote(s.source.keyId) : undefined}
      />
      <Row
        label="API secret"
        value={s.secretConfigured ? 'Set' : 'Missing'}
        tone={s.secretConfigured ? 'ok' : 'bad'}
        note={s.secretConfigured ? sourceNote(s.source.keySecret) : undefined}
      />
      <Row
        label="Webhook secret"
        value={s.webhookSecretConfigured ? 'Set' : 'Missing'}
        tone={s.webhookSecretConfigured ? 'ok' : 'bad'}
        note={s.webhookSecretConfigured ? sourceNote(s.source.webhookSecret) : undefined}
      />
      <Row label="Webhook" value={webhookText} tone={s.lastWebhookAt ? 'ok' : 'warn'} />
      <Row label="Unpaid online orders" value={String(s.openOnlineOrders)} />
      {s.credentialsUpdatedAt && (
        <Row label="Last changed here" value={new Date(s.credentialsUpdatedAt).toLocaleString('en-IN')} />
      )}

      {s.overrideUnreadable && (
        <p className="fp-status fp-status--bad" role="alert">
          The credentials saved here can no longer be read, so the server settings are being used. Enter them again.
        </p>
      )}

      {editing && (
        <form
          className="pg-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          data-testid="gateway-form"
        >
          <p className="admin-subtitle">
            Leave a field empty to keep what is set now. Secrets are encrypted and never shown again after saving.
            New API keys are checked with Razorpay before they are used.
          </p>

          <label htmlFor="pg-keyid">Key ID</label>
          <input
            id="pg-keyid"
            className="auth-input"
            autoComplete="off"
            spellCheck={false}
            placeholder="rzp_live_xxxxxxxxxxxx"
            value={form.keyId}
            onChange={(e) => set('keyId', e.target.value)}
          />

          <label htmlFor="pg-keysecret">Key secret</label>
          <input
            id="pg-keysecret"
            className="auth-input"
            type={inputType}
            autoComplete="new-password"
            spellCheck={false}
            placeholder={s.secretConfigured ? '•••••••• (set; type to replace)' : 'Key secret'}
            value={form.keySecret}
            onChange={(e) => set('keySecret', e.target.value)}
          />
          <span className="prod-form__hint">Enter the Key ID and the Key secret together.</span>

          <label htmlFor="pg-webhook">Webhook secret</label>
          <div className="pg-inline">
            <input
              id="pg-webhook"
              className="auth-input"
              type={inputType}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={s.webhookSecretConfigured ? '•••••••• (set; type to replace)' : 'Webhook secret'}
              value={form.webhookSecret}
              onChange={(e) => set('webhookSecret', e.target.value)}
            />
            <button
              type="button"
              className="mh-link-btn"
              onClick={() => {
                set('webhookSecret', generateWebhookSecret());
                setShowSecrets(true);
              }}
            >
              Generate
            </button>
            {form.webhookSecret && (
              <button type="button" className="mh-link-btn" onClick={() => void copy(form.webhookSecret, 'secret')}>
                {copied === 'secret' ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          <span className="prod-form__hint">
            Use the same value in Razorpay → Settings → Webhooks. If you generate a new one, copy it before saving.
          </span>

          <label className="mh-check">
            <input type="checkbox" checked={showSecrets} onChange={(e) => setShowSecrets(e.target.checked)} />
            Show what I type
          </label>

          <div className="pg-actions">
            <button type="submit" className="auth-btn" disabled={busy !== null} data-testid="gateway-save">
              {busy === 'save' ? 'Checking & saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="mh-link-btn"
              disabled={busy !== null}
              onClick={() => {
                setEditing(false);
                setForm(EMPTY_FORM);
                setMsg(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="pg-actions">
        <button type="button" className="mh-link-btn" disabled={busy !== null} onClick={() => void test()} data-testid="gateway-test">
          {busy === 'test' ? 'Checking…' : 'Test connection'}
        </button>
        {hasSavedHere && (
          <button type="button" className="mh-link-btn" disabled={busy !== null} onClick={() => void reset()}>
            Use server settings
          </button>
        )}
      </div>

      {msg && (
        <p role="status" className={`fp-status fp-status--${msg.ok ? 'ok' : 'bad'}`} data-testid="gateway-msg">
          {msg.text}
        </p>
      )}

      <div className="pg-url">
        <span className="pg-row__label">Webhook URL for the Razorpay dashboard</span>
        <code data-testid="gateway-webhook-url">{s.webhookUrl}</code>
        <button type="button" className="mh-link-btn" onClick={() => void copy(s.webhookUrl, 'url')}>
          {copied === 'url' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="admin-subtitle">
        Events to subscribe: payment.authorized, payment.captured, payment.failed, order.paid. Changes here apply to
        new payments straight away. Whether payments run live or in test mode is decided by the server setting.
      </p>
    </section>
  );
}
