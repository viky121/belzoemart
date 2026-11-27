import { formatMoney, paise } from '@belzo/shared';

/**
 * Customer-facing transactional email templates (pure functions, no I/O).
 * Every dynamic value is HTML-escaped. Layout is table-based with inline styles so it renders in
 * Gmail, Outlook and mobile clients. Amounts are integer paise (the order snapshot).
 */

export interface RenderedEmail {
  subject: string;
  html: string;
}

export interface MailOrderItem {
  title: string;
  quantity: number;
  /** Paise, GST-inclusive unit price. */
  unitPrice: number;
}

export interface MailOrder {
  id: string;
  items: MailOrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  codFee: number;
  grandTotal: number;
}

export interface MailAddress {
  fullName: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
}

const STORE_NAME = 'Belzo eMart';
const BRAND = '#0f766e';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

const inr = (p: number) => esc(formatMoney(paise(p)));

/** Short, human order reference, same as on the invoice ("#1A2B3C4D"). */
export function orderRef(orderId: string): string {
  return `#${orderId.slice(0, 8).toUpperCase()}`;
}

function baseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
}

/** Absolute link on the storefront (empty string when PUBLIC_BASE_URL is not configured). */
function storeLink(path: string): string {
  const base = baseUrl();
  return base ? `${base}${path}` : '';
}

export function orderUrl(orderId: string): string {
  return storeLink(`/orders/${encodeURIComponent(orderId)}`);
}

/** A courier tracking link: absolute URLs as is, site-relative ones resolved against the storefront. */
export function trackingLink(trackingUrl: string | null | undefined): string {
  const u = (trackingUrl ?? '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return u.startsWith('/') ? storeLink(u) : '';
}

function button(label: string, url: string): string {
  if (!url) return '';
  return `<p style="margin:24px 0 8px"><a href="${esc(url)}" style="background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:6px;display:inline-block">${esc(label)}</a></p>`;
}

function layout(heading: string, bodyHtml: string): string {
  const site = baseUrl();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:${BRAND};padding:18px 24px;color:#ffffff;font-size:20px;font-weight:700">${esc(STORE_NAME)}</td></tr>
<tr><td style="padding:28px 24px;font-size:15px;line-height:1.55">
<h1 style="margin:0 0 16px;font-size:20px;color:#111827">${esc(heading)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.5">
This is an automated message from ${esc(STORE_NAME)}${site ? ` (<a href="${esc(site)}" style="color:#6b7280">${esc(site.replace(/^https?:\/\//, ''))}</a>)` : ''}. Please do not reply to this email.
</td></tr>
</table></td></tr></table></body></html>`;
}

function itemsTable(order: MailOrder): string {
  const rows = order.items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb">${esc(i.title)}<div style="color:#6b7280;font-size:13px">Qty ${esc(i.quantity)} × ${inr(i.unitPrice)}</div></td><td align="right" style="padding:8px 0;border-bottom:1px solid #e5e7eb;white-space:nowrap">${inr(i.unitPrice * i.quantity)}</td></tr>`,
    )
    .join('');
  const line = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:4px 0;${bold ? 'font-weight:700;' : 'color:#374151;'}">${label}</td><td align="right" style="padding:4px 0;${bold ? 'font-weight:700;' : ''}white-space:nowrap">${value}</td></tr>`;
  const totals = [
    line('Item total', inr(order.subtotal)),
    order.discount > 0 ? line('Discount', `− ${inr(order.discount)}`) : '',
    line('Shipping', order.shipping > 0 ? inr(order.shipping) : 'Free'),
    order.codFee > 0 ? line('Cash on delivery fee', inr(order.codFee)) : '',
    line('Total (incl. GST)', inr(order.grandTotal), true),
  ].join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px">${rows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0">${totals}</table>`;
}

function addressBlock(a: MailAddress | null): string {
  if (!a) return '';
  const lines = [a.fullName, a.line1, a.line2, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).map((l) => esc(l));
  return `<p style="margin:20px 0 4px;font-weight:700">Delivering to</p><p style="margin:0;color:#374151">${lines.join('<br>')}</p>`;
}

/** Self pickup: where and when the customer collects the order (the shop address is on the order page). */
function pickupBlock(slot: string | null | undefined): string {
  return `<p style="margin:20px 0 4px;font-weight:700">Self pickup</p><p style="margin:0;color:#374151">${
    slot ? `Collect your order at the shop on ${esc(slot)}.` : 'Collect your order at the shop.'
  } We will tell you when it is ready.</p>`;
}
function firstName(name: string | null | undefined): string {
  const n = (name ?? '').trim().split(/\s+/)[0];
  return n || 'there';
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function welcomeEmail(input: { name?: string | null }): RenderedEmail {
  const body = `<p>Hi ${esc(firstName(input.name))},</p>
<p>Welcome to ${esc(STORE_NAME)}. Your account is ready, so you can now shop, track orders and download invoices from one place.</p>
${button('Start shopping', storeLink('/'))}`;
  return { subject: `Welcome to ${STORE_NAME}`, html: layout('Your account is ready', body) };
}

export function orderConfirmedEmail(input: {
  name?: string | null;
  order: MailOrder;
  address: MailAddress | null;
  /** Self pickup order: shows the pickup time instead of a delivery address. */
  pickup?: { slot: string | null };
}): RenderedEmail {
  const ref = orderRef(input.order.id);
  const body = `<p>Hi ${esc(firstName(input.name))},</p>
<p>Thank you for your order. We have received it and are getting it ready. Your tax invoice will follow in a separate email.</p>
<p style="margin:16px 0 4px"><strong>Order ${esc(ref)}</strong></p>
${itemsTable(input.order)}
${input.pickup ? pickupBlock(input.pickup.slot) : addressBlock(input.address)}
${button('View order', orderUrl(input.order.id))}`;
  return { subject: `Order confirmed ${ref} - ${STORE_NAME}`, html: layout('Your order is confirmed', body) };
}

export function orderShippedEmail(input: {
  name?: string | null;
  orderId: string;
  courier?: string | null;
  awb?: string | null;
  trackingUrl?: string | null;
  estimatedDelivery?: Date | null;
}): RenderedEmail {
  const ref = orderRef(input.orderId);
  const eta = input.estimatedDelivery
    ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(
        input.estimatedDelivery,
      )
    : '';
  const details = [
    input.courier ? `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">Courier</td><td>${esc(input.courier)}</td></tr>` : '',
    input.awb ? `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">Tracking number</td><td>${esc(input.awb)}</td></tr>` : '',
    eta ? `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">Expected by</td><td>${esc(eta)}</td></tr>` : '',
  ].join('');
  const track = trackingLink(input.trackingUrl) || orderUrl(input.orderId);
  const body = `<p>Hi ${esc(firstName(input.name))},</p>
<p>Good news. Your order <strong>${esc(ref)}</strong> has been shipped and is on its way.</p>
${details ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0">${details}</table>` : ''}
${button('Track your order', track)}`;
  return { subject: `Your order ${ref} has shipped - ${STORE_NAME}`, html: layout('Your order is on its way', body) };
}

export function orderReadyForPickupEmail(input: { name?: string | null; orderId: string; slot?: string | null }): RenderedEmail {
  const ref = orderRef(input.orderId);
  const body = `<p>Hi ${esc(firstName(input.name))},</p>
<p>Your order <strong>${esc(ref)}</strong> is packed and ready for pickup at the shop${input.slot ? `, as planned for ${esc(input.slot)}` : ''}.</p>
<p>The shop address and timings are on your order page.</p>
${button('View order', orderUrl(input.orderId))}`;
  return { subject: `Your order ${ref} is ready for pickup - ${STORE_NAME}`, html: layout('Your order is ready for pickup', body) };
}
export function orderDeliveredEmail(input: { name?: string | null; orderId: string; pickup?: boolean }): RenderedEmail {
  const ref = orderRef(input.orderId);
  const body = `<p>Hi ${esc(firstName(input.name))},</p>
<p>Your order <strong>${esc(ref)}</strong> has been ${input.pickup ? 'picked up' : 'delivered'}. We hope you enjoy it.</p>
<p>You can view the order, download your invoice or share a review from your account.</p>
${button('View order', orderUrl(input.orderId))}`;
  return { subject: `Your order ${ref} was delivered - ${STORE_NAME}`, html: layout('Your order was delivered', body) };
}

export function invoiceEmail(input: {
  name?: string | null;
  orderId: string;
  invoiceNumber: string;
}): RenderedEmail {
  const ref = orderRef(input.orderId);
  const body = `<p>Hi ${esc(firstName(input.name))},</p>
<p>Your GST tax invoice <strong>${esc(input.invoiceNumber)}</strong> for order <strong>${esc(ref)}</strong> is attached to this email as a PDF.</p>
<p>You can also download it any time from your order page.</p>
${button('View order', orderUrl(input.orderId))}`;
  return {
    subject: `Tax invoice ${input.invoiceNumber} for order ${ref} - ${STORE_NAME}`,
    html: layout('Your tax invoice', body),
  };
}

// ---------------------------------------------------------------------------
// Shop (admin) order alerts
// ---------------------------------------------------------------------------

/** Everything an order alert shows. Amounts are paise; labels are already human ("Cash on Delivery", "Paid"). */
export interface AdminAlertOrder extends MailOrder {
  createdAt: Date;
  fulfilment: 'delivery' | 'pickup';
  pickupSlot: string | null;
  customer: { name: string | null; phone: string | null; email: string | null };
  address: (MailAddress & { phone?: string | null }) | null;
  paymentMethod: string;
  paymentStatus: string;
}

/** Link to the order in the admin panel (empty when PUBLIC_BASE_URL is not configured). */
export function adminOrderUrl(orderId: string): string {
  return storeLink(`/admin/orders/${encodeURIComponent(orderId)}`);
}

function istTime(d: Date): string {
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function factsTable(rows: [string, string][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;font-size:14px">${rows
    .filter(([, v]) => v !== '')
    .map(
      ([k, v]) =>
        `<tr><td style="padding:5px 12px 5px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:5px 0;color:#111827">${v}</td></tr>`,
    )
    .join('')}</table>`;
}

function customerAndDelivery(o: AdminAlertOrder): [string, string][] {
  const contact = [o.customer.phone, o.customer.email].filter(Boolean).map((v) => esc(v)).join(' · ');
  const where =
    o.fulfilment === 'pickup'
      ? `Self pickup${o.pickupSlot ? ` · ${esc(o.pickupSlot)}` : ''}`
      : o.address
        ? [o.address.fullName, o.address.line1, o.address.line2, `${o.address.city}, ${o.address.state} ${o.address.pincode}`]
            .filter(Boolean)
            .map((l) => esc(l))
            .join(', ')
        : '';
  return [
    ['Customer', esc(o.customer.name ?? '')],
    ['Contact', contact],
    [o.fulfilment === 'pickup' ? 'Fulfilment' : 'Deliver to', where],
  ];
}

const itemCount = (o: AdminAlertOrder) => o.items.reduce((n, i) => n + i.quantity, 0);

/** A new order to prepare (Cash on Delivery / pay at shop placed, or paid online). */
export function adminNewOrderEmail(o: AdminAlertOrder): RenderedEmail {
  const ref = orderRef(o.id);
  const n = itemCount(o);
  const body = `<p style="margin:0 0 12px">A new order was placed on ${esc(STORE_NAME)}.</p>
${factsTable([
  ['Order', `<strong>${esc(ref)}</strong>`],
  ['Placed', esc(istTime(o.createdAt))],
  ['Amount', `<strong>${inr(o.grandTotal)}</strong> · ${esc(n)} item${n === 1 ? '' : 's'}`],
  ['Payment', `${esc(o.paymentMethod)} · ${esc(o.paymentStatus)}`],
  ...customerAndDelivery(o),
])}
${itemsTable(o)}
${button('Open the order', adminOrderUrl(o.id))}`;
  return { subject: `New order ${ref} - ${formatMoney(paise(o.grandTotal))} (${o.paymentMethod})`, html: layout(`New order ${ref}`, body) };
}

/** A customer's online payment did not go through (the order is still open, they can pay again). */
export function adminPaymentFailedEmail(o: AdminAlertOrder): RenderedEmail {
  const ref = orderRef(o.id);
  const body = `<p style="margin:0 0 12px">The customer's online payment for this order did not go through. The order is <strong>not confirmed</strong>: they can still pay again. If it stays unpaid it is cancelled automatically about 30 minutes after it was placed, and the stock goes back.</p>
${factsTable([
  ['Order', `<strong>${esc(ref)}</strong>`],
  ['Placed', esc(istTime(o.createdAt))],
  ['Amount', `<strong>${inr(o.grandTotal)}</strong>`],
  ['Payment', `${esc(o.paymentMethod)} · ${esc(o.paymentStatus)}`],
  ...customerAndDelivery(o),
])}
<p style="margin:0 0 4px;color:#374151;font-size:14px">You may want to call the customer if they need help paying. Nothing needs to be packed yet.</p>
${button('Open the order', adminOrderUrl(o.id))}`;
  return { subject: `Payment failed: order ${ref} - ${formatMoney(paise(o.grandTotal))}`, html: layout(`Payment failed for ${ref}`, body) };
}

const CANCELLED_BY: Record<string, string> = { customer: 'the customer', admin: 'staff (admin panel)', system: 'the system' };

/** An order was cancelled (by the customer, by staff, or automatically). */
export function adminOrderCancelledEmail(
  o: AdminAlertOrder,
  info: { by?: string | null; reason?: string | null; refund?: string | null },
): RenderedEmail {
  const ref = orderRef(o.id);
  const by = CANCELLED_BY[info.by ?? ''] ?? '';
  const body = `<p style="margin:0 0 12px">This order was cancelled${by ? ` by ${esc(by)}` : ''}. Do not pack or send it. Its stock has been put back.</p>
${factsTable([
  ['Order', `<strong>${esc(ref)}</strong>`],
  ['Placed', esc(istTime(o.createdAt))],
  ['Amount', `<strong>${inr(o.grandTotal)}</strong>`],
  ['Reason', esc(info.reason ?? '')],
  ['Payment', `${esc(o.paymentMethod)} · ${esc(o.paymentStatus)}`],
  ['Refund', esc(info.refund ?? '')],
  ...customerAndDelivery(o),
])}
${itemsTable(o)}
${button('Open the order', adminOrderUrl(o.id))}`;
  return { subject: `Order cancelled ${ref} - ${formatMoney(paise(o.grandTotal))}${by ? ` (by ${by})` : ''}`, html: layout(`Order ${ref} was cancelled`, body) };
}

/** Sent from Admin → Settings to check that alerts reach the inbox. */
export function adminAlertTestEmail(recipients: string[]): RenderedEmail {
  const body = `<p style="margin:0 0 12px">This is a test. Order alerts from ${esc(STORE_NAME)} reach this inbox.</p>
<p style="margin:0;color:#374151;font-size:14px">Alerts are sent to: ${recipients.map((r) => esc(r)).join(', ')}</p>
${button('Open the admin panel', storeLink('/admin/orders'))}`;
  return { subject: `Test: order alerts - ${STORE_NAME}`, html: layout('Order alerts are working', body) };
}
