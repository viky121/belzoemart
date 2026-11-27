'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ADMIN_ALERTS_SETTING_KEY,
  MAX_ADMIN_ALERT_EMAILS,
  invalidAlertEmails,
  parseAlertEmails,
  sanitizeAdminAlerts,
  type AdminAlertsConfig,
} from '@belzo/shared';
import { adminFetch } from '@/lib/admin-api';

interface Props {
  settings: Record<string, unknown>;
  /** Saves one setting (the settings page audits and stores it). */
  onSave: (key: string, value: unknown) => void | Promise<void>;
}

interface Status {
  config: AdminAlertsConfig;
  recipients: string[];
  usingDefault: boolean;
  emailLive: boolean;
}

const hint = { color: '#64748b', fontSize: '0.85rem', margin: '0.25rem 0 0' } as const;
const good = { ...hint, color: '#15803d' } as const;
const bad = { ...hint, color: '#b91c1c' } as const;

const EVENTS: { key: 'newOrder' | 'paymentFailed' | 'cancelled'; label: string; help: string }[] = [
  { key: 'newOrder', label: 'New order', help: 'Cash on Delivery / pay at shop as soon as it is placed; online orders once they are paid.' },
  { key: 'paymentFailed', label: 'Online payment failed', help: 'Once per order. The customer can still pay again.' },
  { key: 'cancelled', label: 'Order cancelled', help: 'By the customer, by staff, or automatically (unpaid after 30 minutes, delivery failed).' },
];

/**
 * Admin Settings: Order alerts. The shop gets an email for a new order, a failed online payment and a cancelled
 * order. Empty address box = the shop's own sending address.
 */
export function OrderAlertsCard({ settings, onSave }: Props) {
  const saved = sanitizeAdminAlerts(settings[ADMIN_ALERTS_SETTING_KEY]);
  const [text, setText] = useState(saved.emails.join(', '));
  const [flags, setFlags] = useState({ newOrder: saved.newOrder, paymentFailed: saved.paymentFailed, cancelled: saved.cancelled });
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const loadStatus = useCallback(async () => {
    setStatus(await adminFetch<Status>('/admin/notifications/order-alerts').catch(() => null));
  }, []);
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const wrong = invalidAlertEmails(text);
  const emails = parseAlertEmails(text);
  const tooMany = text.split(/[\s,;]+/).filter(Boolean).length > MAX_ADMIN_ALERT_EMAILS;
  const dirty =
    emails.join(',') !== saved.emails.join(',') ||
    flags.newOrder !== saved.newOrder ||
    flags.paymentFailed !== saved.paymentFailed ||
    flags.cancelled !== saved.cancelled;

  async function save() {
    if (wrong.length > 0 || busy) return;
    setBusy('save');
    setMsg(null);
    try {
      await onSave(ADMIN_ALERTS_SETTING_KEY, { emails, ...flags });
      setText(emails.join(', '));
      await loadStatus();
      setMsg({ text: 'Saved.', ok: true });
    } catch {
      setMsg({ text: 'Could not save. Please try again.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    if (busy) return;
    setBusy('test');
    setMsg(null);
    try {
      const r = await adminFetch<{ sentTo: string[] }>('/admin/notifications/order-alerts/test', { method: 'POST' });
      setMsg({ text: `Test email sent to ${r.sentTo.join(', ')}. Check the inbox (and Spam).`, ok: true });
    } catch (e) {
      setMsg({ text: e instanceof Error && e.message ? e.message : 'Could not send the test email.', ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-form" data-testid="order-alerts">
      <h2>Order alerts by email</h2>
      <p style={{ ...hint, margin: '0 0 0.75rem' }}>The shop gets an email with the order details and a link to it in the admin panel.</p>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="alert-emails">Send alerts to (up to {MAX_ADMIN_ALERT_EMAILS} addresses, separated by commas)</label>
        <input
          id="alert-emails"
          type="text"
          autoComplete="off"
          value={text}
          placeholder={status?.usingDefault && status.recipients[0] ? status.recipients[0] : 'shop@example.com'}
          onChange={(e) => setText(e.target.value)}
          data-testid="alert-emails"
        />
        {wrong.length > 0 ? (
          <p role="alert" style={bad}>Not a valid email address: {wrong.join(', ')}</p>
        ) : tooMany ? (
          <p role="alert" style={bad}>Only the first {MAX_ADMIN_ALERT_EMAILS} addresses are kept.</p>
        ) : status ? (
          <p style={hint} data-testid="alert-recipients">
            {status.recipients.length === 0
              ? 'No address yet: alerts are not sent.'
              : `Alerts go to: ${status.recipients.join(', ')}${status.usingDefault ? ' (the shop’s sending address, used while the box is empty)' : ''}`}
          </p>
        ) : null}
        {status && !status.emailLive && <p style={bad}>Email sending is switched off on this server, so no alert is sent.</p>}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        {EVENTS.map((ev) => (
          <div key={ev.key} style={{ marginBottom: '0.6rem' }}>
            <label>
              <input
                type="checkbox"
                checked={flags[ev.key]}
                onChange={(e) => setFlags((f) => ({ ...f, [ev.key]: e.target.checked }))}
                data-testid={`alert-${ev.key}`}
              />{' '}
              {ev.label}
            </label>
            <p style={{ ...hint, margin: '0 0 0 1.5rem' }}>{ev.help}</p>
          </div>
        ))}
      </div>

      <button type="button" className="auth-btn" disabled={busy !== null || !dirty || wrong.length > 0} onClick={() => void save()} data-testid="alert-save">
        {busy === 'save' ? 'Saving…' : 'Save'}
      </button>{' '}
      <button
        type="button"
        className="mh-link-btn"
        disabled={busy !== null || dirty || !status || status.recipients.length === 0}
        title={dirty ? 'Save first' : undefined}
        onClick={() => void test()}
        data-testid="alert-test"
      >
        {busy === 'test' ? 'Sending…' : 'Send test email'}
      </button>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} style={msg.ok ? good : bad} data-testid="alert-msg">
          {msg.text}
        </p>
      )}
    </div>
  );
}
