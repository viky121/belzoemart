'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-api';

interface GatewayStatus {
  mode: 'live' | 'mock';
  keyType: 'live' | 'test' | 'none';
  keyHint: string;
  secretConfigured: boolean;
  webhookSecretConfigured: boolean;
  webhookUrl: string;
  lastWebhookAt: string | null;
  openOnlineOrders: number;
}

type Tone = 'ok' | 'warn' | 'bad';

function Row({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="pg-row">
      <span className="pg-row__label">{label}</span>
      <span className={`pg-row__value${tone ? ` pg-row__value--${tone}` : ''}`}>{value}</span>
    </div>
  );
}

/**
 * Read-only view of the Razorpay setup. The API keys live in the server environment
 * (never in the browser or the database), so this page shows whether they are in place
 * and whether Razorpay's webhook is reaching us, without ever showing a secret.
 * Only super admins can read it; anyone else simply doesn't see the card.
 */
export function GatewayStatusCard() {
  const [s, setS] = useState<GatewayStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminFetch<GatewayStatus>('/admin/payment-gateway/status')
      .then((d) => !cancelled && setS(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function copy() {
    try {
      await navigator.clipboard.writeText(s!.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the URL is visible to select */
    }
  }

  return (
    <section className="admin-card pg-card" data-testid="gateway-status">
      <h2>Payment gateway (Razorpay)</h2>
      <Row label="Mode" value={modeText} tone={live ? 'ok' : 'warn'} />
      <Row label="API key" value={s.keyHint ? `${s.keyHint}` : 'Not set'} tone={s.keyHint ? 'ok' : 'bad'} />
      <Row label="API secret" value={s.secretConfigured ? 'Set' : 'Missing'} tone={s.secretConfigured ? 'ok' : 'bad'} />
      <Row
        label="Webhook secret"
        value={s.webhookSecretConfigured ? 'Set' : 'Missing'}
        tone={s.webhookSecretConfigured ? 'ok' : 'bad'}
      />
      <Row label="Webhook" value={webhookText} tone={s.lastWebhookAt ? 'ok' : 'warn'} />
      <Row label="Unpaid online orders" value={String(s.openOnlineOrders)} />
      <div className="pg-url">
        <span className="pg-row__label">Webhook URL for the Razorpay dashboard</span>
        <code data-testid="gateway-webhook-url">{s.webhookUrl}</code>
        <button type="button" className="mh-link-btn" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="admin-subtitle">
        Events to subscribe: payment.authorized, payment.captured, payment.failed, order.paid. Keys are kept on the
        server and can&apos;t be edited here; to change them, update the server settings.
      </p>
    </section>
  );
}
