'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';
import { buildSmsPayload, EMPTY_SMS_FORM, formFromStatus, type SmsForm, type SmsRoute } from './sms-form';

const ROUTE_LABEL: Record<SmsRoute, string> = {
  otp: 'OTP route ("Your OTP: 123456")',
  dlt: 'DLT template',
  smart: 'Smart OTP template',
};

type Source = 'admin' | 'env';

interface SmsStatus {
  mode: 'live' | 'mock';
  route: SmsRoute;
  keyHint: string;
  keyConfigured: boolean;
  senderId: string;
  dltMessageId: string;
  otpId: string;
  otpIdRegister: string;
  otpIdReset: string;
  otpIdDelivery: string;
  source: { apiKey: Source; route: Source; senderId: Source; dltMessageId: Source; otpId: Source };
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

function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/**
 * Fast2SMS (OTP SMS) setup. The API key is write-only: it is encrypted on the server and never
 * sent back to the browser (only its last 4 characters), so the field starts empty and a blank
 * field means "keep the current key". Anyone who isn't a super admin doesn't see this card.
 */
export function SmsGatewayCard() {
  const [s, setS] = useState<SmsStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SmsForm>(EMPTY_SMS_FORM);
  const [busy, setBusy] = useState<'save' | 'test' | 'sms' | 'reset' | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  useEffect(() => {
    let cancelled = false;
    adminFetch<SmsStatus>('/admin/sms-gateway/status')
      .then((d) => !cancelled && setS(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!s) return null;

  const live = s.mode === 'live';
  const hasSavedHere = Object.values(s.source).includes('admin');
  const set = <K extends keyof SmsForm>(k: K, v: SmsForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  function startEdit() {
    setForm(formFromStatus(s!));
    setEditing(true);
    setMsg(null);
  }

  async function save() {
    setMsg(null);
    const built = buildSmsPayload(form, s!);
    if ('error' in built) {
      setMsg({ text: built.error, ok: false });
      return;
    }
    setBusy('save');
    try {
      const next = await adminFetch<SmsStatus>('/admin/sms-gateway/credentials', { method: 'PUT', body: built.payload });
      setS(next);
      setForm(EMPTY_SMS_FORM);
      setEditing(false);
      setShowKey(false);
      setMsg({ text: 'Saved. OTP SMS now use these settings.', ok: true });
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
      const r = await adminFetch<{ ok: boolean; message: string }>('/admin/sms-gateway/test', { method: 'POST' });
      setMsg({ text: r.message, ok: r.ok });
    } catch (e) {
      setMsg({ text: errText(e, 'Could not run the check.'), ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function testSms() {
    if (!window.confirm(`Send one real test SMS to ${testPhone}? It uses one SMS from your Fast2SMS wallet.`)) return;
    setBusy('sms');
    setMsg(null);
    try {
      const r = await adminFetch<{ ok: boolean; message: string }>('/admin/sms-gateway/test-sms', {
        method: 'POST',
        body: { phone: testPhone },
      });
      setMsg({ text: r.message, ok: r.ok });
    } catch (e) {
      setMsg({ text: errText(e, 'Could not send the test SMS.'), ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!window.confirm('Remove the settings saved here and go back to the server settings?')) return;
    setBusy('reset');
    setMsg(null);
    try {
      setS(await adminFetch<SmsStatus>('/admin/sms-gateway/credentials', { method: 'DELETE' }));
      setMsg({ text: 'Now using the server settings.', ok: true });
    } catch (e) {
      setMsg({ text: errText(e, 'Could not reset.'), ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="admin-card pg-card" data-testid="sms-gateway" style={{ marginBottom: '1.5rem' }}>
      <div className="pg-head">
        <h2>OTP SMS (Fast2SMS)</h2>
        {!editing && (
          <button type="button" className="auth-btn pg-edit" onClick={startEdit} data-testid="sms-edit">
            Edit
          </button>
        )}
      </div>

      <Row
        label="Mode"
        value={live ? 'Live (real SMS)' : 'Test mode (no SMS is sent)'}
        tone={live ? 'ok' : 'warn'}
        note="set on the server"
      />
      <Row
        label="API key"
        value={s.keyConfigured ? s.keyHint : 'Not set'}
        tone={s.keyConfigured ? 'ok' : 'bad'}
        note={s.keyConfigured ? sourceNote(s.source.apiKey) : undefined}
      />
      <Row
        label="Route"
        value={ROUTE_LABEL[s.route]}
        note={sourceNote(s.source.route)}
      />
      {s.route === 'smart' && (
        <>
          <Row
            label="Registration OTP ID"
            value={s.otpIdRegister || s.otpId || 'Missing'}
            tone={s.otpIdRegister || s.otpId ? 'ok' : 'bad'}
          />
          <Row
            label="Password reset OTP ID"
            value={s.otpIdReset || s.otpId || 'Missing'}
            tone={s.otpIdReset || s.otpId ? 'ok' : 'bad'}
          />
          <Row
            label="Delivery OTP ID"
            value={s.otpIdDelivery || s.otpId || 'Not set'}
            tone={s.otpIdDelivery || s.otpId ? 'ok' : 'warn'}
          />
        </>
      )}
      {s.route === 'dlt' && (
        <>
          <Row label="Sender ID" value={s.senderId || 'Missing'} tone={s.senderId ? 'ok' : 'bad'} />
          <Row label="Message ID" value={s.dltMessageId || 'Missing'} tone={s.dltMessageId ? 'ok' : 'bad'} />
        </>
      )}
      {s.credentialsUpdatedAt && (
        <Row label="Last changed here" value={new Date(s.credentialsUpdatedAt).toLocaleString('en-IN')} />
      )}

      {s.overrideUnreadable && (
        <p className="fp-status fp-status--bad" role="alert">
          The API key saved here can no longer be read, so the server setting is being used. Enter it again.
        </p>
      )}

      {editing && (
        <form
          className="pg-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          data-testid="sms-form"
        >
          <p className="admin-subtitle">
            Leave the API key empty to keep the current one. The key is encrypted and never shown again after saving. A
            new key is checked with Fast2SMS (no SMS is sent) before it is used.
          </p>

          <label htmlFor="sms-key">API key (Fast2SMS &rarr; Dev API)</label>
          <input
            id="sms-key"
            className="auth-input"
            type={showKey ? 'text' : 'password'}
            autoComplete="new-password"
            spellCheck={false}
            placeholder={s.keyConfigured ? '•••••••• (set; type to replace)' : 'Paste your API key'}
            value={form.apiKey}
            onChange={(e) => set('apiKey', e.target.value)}
          />
          <label className="mh-check">
            <input type="checkbox" checked={showKey} onChange={(e) => setShowKey(e.target.checked)} />
            Show what I type
          </label>

          <label htmlFor="sms-route">Route</label>
          <select
            id="sms-route"
            className="auth-input"
            value={form.route}
            onChange={(e) => set('route', e.target.value as SmsForm['route'])}
          >
            <option value="smart">Smart OTP: your DLT-approved OTP template linked in Fast2SMS (recommended)</option>
            <option value="otp">OTP route: Fast2SMS sends &quot;Your OTP: 123456&quot; (needs website verification)</option>
            <option value="dlt">DLT template: sender ID + message ID</option>
          </select>

          {form.route === 'smart' && (
            <>
              {(
                [
                  ['otpIdRegister', 'Registration OTP ID', 'Sent when a customer creates an account'],
                  ['otpIdReset', 'Password reset OTP ID', 'Sent for “Forgot password”'],
                  ['otpIdDelivery', 'Delivery OTP ID (optional)', 'For the delivery hand-over code'],
                  ['otpId', 'General OTP ID (optional)', 'Used for any purpose above that is left empty'],
                ] as const
              ).map(([key, label, hint]) => (
                <div key={key}>
                  <label htmlFor={`sms-${key}`}>{label}</label>
                  <input
                    id={`sms-${key}`}
                    className="auth-input"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="e.g. d4f921736d"
                    value={form[key]}
                    onChange={(e) => set(key, e.target.value)}
                  />
                  <span className="prod-form__hint">{hint}</span>
                </div>
              ))}
              <span className="prod-form__hint">
                Add each template with &quot;Add OTP template&quot; in Fast2SMS &rarr; Smart OTP (SMS channel), then paste the
                OTP ID it shows. A registration and a password reset ID are enough to start.
              </span>
            </>
          )}

          {form.route === 'dlt' && (
            <>
              <label htmlFor="sms-sender">Sender ID (3 to 6 letters, DLT approved)</label>
              <input
                id="sms-sender"
                className="auth-input"
                autoComplete="off"
                maxLength={6}
                placeholder="BELZOE"
                value={form.senderId}
                onChange={(e) => set('senderId', e.target.value)}
              />
              <label htmlFor="sms-msgid">Message ID (approved OTP template)</label>
              <input
                id="sms-msgid"
                className="auth-input"
                autoComplete="off"
                inputMode="numeric"
                placeholder="178001"
                value={form.dltMessageId}
                onChange={(e) => set('dltMessageId', e.target.value)}
              />
              <span className="prod-form__hint">The template must contain one variable for the OTP code.</span>
            </>
          )}

          <div className="pg-actions">
            <button type="submit" className="auth-btn" disabled={busy !== null} data-testid="sms-save">
              {busy === 'save' ? 'Checking & saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="mh-link-btn"
              disabled={busy !== null}
              onClick={() => {
                setEditing(false);
                setForm(EMPTY_SMS_FORM);
                setMsg(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="pg-actions">
        <button type="button" className="mh-link-btn" disabled={busy !== null} onClick={() => void test()} data-testid="sms-test">
          {busy === 'test' ? 'Checking…' : 'Check key & wallet'}
        </button>
        {hasSavedHere && (
          <button type="button" className="mh-link-btn" disabled={busy !== null} onClick={() => void reset()}>
            Use server settings
          </button>
        )}
      </div>

      {live && (
        <div className="pg-inline" style={{ marginTop: 10 }}>
          <input
            className="auth-input"
            inputMode="tel"
            autoComplete="off"
            aria-label="Mobile number for a test SMS"
            placeholder="10-digit mobile for a test SMS"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
          />
          <button
            type="button"
            className="mh-link-btn"
            disabled={busy !== null || testPhone.replace(/\D/g, '').length < 10}
            onClick={() => void testSms()}
            data-testid="sms-test-sms"
          >
            {busy === 'sms' ? 'Sending…' : 'Send test SMS (uses 1 SMS)'}
          </button>
        </div>
      )}

      {msg && (
        <p role="status" className={`fp-status fp-status--${msg.ok ? 'ok' : 'bad'}`} data-testid="sms-msg">
          {msg.text}
        </p>
      )}

      <p className="admin-subtitle">
        Changes apply to new OTPs straight away. Whether SMS are real or test is decided by the server setting. Each
        customer can request one code per 30 seconds and 5 per hour.
      </p>
    </section>
  );
}
