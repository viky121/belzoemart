/**
 * Order alert emails for the shop (Admin → Settings → Order alerts): who gets them and for which events.
 * Pure: the API stores only what {@link sanitizeAdminAlerts} returns, and the worker reads it the same way.
 */

/** Settings key holding the {@link AdminAlertsConfig}. */
export const ADMIN_ALERTS_SETTING_KEY = 'notifications.admin';

/** At most this many addresses get each alert. */
export const MAX_ADMIN_ALERT_EMAILS = 5;

export type AdminAlertEvent = 'new_order' | 'payment_failed' | 'cancelled';

export interface AdminAlertsConfig {
  /** Who gets the alerts. Empty = the shop's own sending address (the one customer emails come from). */
  emails: string[];
  /** A new order: placed as Cash on Delivery / pay at shop, or paid online. */
  newOrder: boolean;
  /** An online payment attempt failed (once per order). */
  paymentFailed: boolean;
  /** An order was cancelled: by the customer, by staff, or by the system (unpaid, undeliverable). */
  cancelled: boolean;
}

export const DEFAULT_ADMIN_ALERTS: AdminAlertsConfig = { emails: [], newOrder: true, paymentFailed: true, cancelled: true };

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

/** One address, trimmed and lowercased, or null when it is not a usable email address. */
export function normalizeAlertEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

/** Addresses from a list or from text separated by commas, semicolons, spaces or new lines: valid, unique, at most 5. */
export function parseAlertEmails(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,;]+/) : [];
  const out: string[] = [];
  for (const p of parts) {
    const e = normalizeAlertEmail(p);
    if (e && !out.includes(e)) out.push(e);
    if (out.length >= MAX_ADMIN_ALERT_EMAILS) break;
  }
  return out;
}

/** The typed parts of the text that are not valid addresses (shown as an error in the admin form). */
export function invalidAlertEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter((p) => p !== '' && normalizeAlertEmail(p) === null);
}

/** Whatever is stored (or sent by the admin form) → a clean config. Every event is on unless switched off. */
export function sanitizeAdminAlerts(raw: unknown): AdminAlertsConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_ADMIN_ALERTS, emails: [] };
  const r = raw as Record<string, unknown>;
  const flag = (v: unknown) => v !== false;
  return {
    emails: parseAlertEmails(r.emails),
    newOrder: flag(r.newOrder),
    paymentFailed: flag(r.paymentFailed),
    cancelled: flag(r.cancelled),
  };
}

/** Is this event switched on? */
export function adminAlertEnabled(config: AdminAlertsConfig, event: AdminAlertEvent): boolean {
  return event === 'new_order' ? config.newOrder : event === 'payment_failed' ? config.paymentFailed : config.cancelled;
}
