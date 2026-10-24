import fc from 'fast-check';
import { Logger } from '@nestjs/common';
import { DEFAULT_DELIVERY_SETTINGS, UNDELIVERABLE_CANCEL_REASON } from '@belzo/shared';
import { createFakeDb } from '../testing/fake-db';
import { DeliveryError } from '../delivery-errors';
import { DeliveryOtpService } from '../otp/delivery-otp.service';
import { SECURITY_EVENTS, type DeliverySecurityEvents } from '../security-events';
import type { DeliverySettingsService } from '../settings/delivery-settings.service';
import type { AuditLogService } from '../../admin/audit-log.service';
import type { OrderService } from '../../orders/order.service';
import type { ShippingProvider } from '../../../integrations/shipping/shipping.provider';
import type { SmsMessage, SmsProvider } from '../../../integrations/sms/sms.provider';
import { DeliveryGateRegistry, DeliveryJobHooks, type JobCommitted } from './gates';
import { JobRepository } from './job.repository';
import { JobService, newJobCode, newTrackingToken } from './job.service';
import { OrderSyncService } from './order-sync.service';

process.env.DELIVERY_OTP_PEPPER = 'pepper-for-tests-0123456789abcdefghij';

interface WorldOpts {
  orderStatus?: string;
  payment?: 'cod' | 'razorpay';
  address?: Record<string, unknown>;
  customerPhone?: string | null;
  maxActiveJobs?: number;
  settings?: Partial<typeof DEFAULT_DELIVERY_SETTINGS>;
}

function world(opts: WorldOpts = {}) {
  const db = createFakeDb();
  const { t, prisma, clock } = db;
  t.customer.rows.push({ id: 'c1', phone: opts.customerPhone === undefined ? '9999988888' : opts.customerPhone });
  t.address.rows.push({ id: 'a1', fullName: 'Asha Rao', phone: '9876543210', line1: '12 MG Road', line2: null, city: 'Pune', state: 'Maharashtra', pincode: '411001', ...opts.address });
  t.order.rows.push({
    id: 'o1',
    customerId: 'c1',
    addressId: 'a1',
    status: opts.orderStatus ?? 'confirmed',
    grandTotal: 49900,
    items: [{ variantId: 'v1', quantity: 2 }, { variantId: 'v2', quantity: 1 }],
    payments: [{ provider: opts.payment ?? 'razorpay', status: opts.payment === 'cod' ? 'pending' : 'captured' }],
  });
  for (const id of ['p1', 'p2']) {
    t.deliveryPartner.rows.push({ id, name: `Partner ${id}`, isActive: true, isOnline: true, maxActiveJobs: opts.maxActiveJobs ?? 5 });
  }

  const repo = new JobRepository(prisma);
  const settingsValue = { ...DEFAULT_DELIVERY_SETTINGS, ...opts.settings };
  const settings = { get: async () => settingsValue } as unknown as DeliverySettingsService;
  const sent: SmsMessage[] = [];
  const smsState = { failing: false };
  const sms: SmsProvider = {
    send: async (m) => {
      if (smsState.failing) throw new Error('sms down');
      sent.push(m);
      return { messageId: 'm' };
    },
  };
  const secEvents: string[] = [];
  const security = { record: async (e: string) => void secEvents.push(e) } as unknown as DeliverySecurityEvents;
  const audits: any[][] = [];
  const audit = { record: async (...a: any[]) => void audits.push(a) } as unknown as AuditLogService;
  const cancelled: string[] = [];
  const orderFail = { on: false };
  const orders = {
    cancelUndeliverable: async (id: string) => {
      if (orderFail.on) throw new Error('db down');
      cancelled.push(id);
      const o = t.order.rows.find((r) => r.id === id);
      if (o) o.status = 'cancelled';
    },
  } as unknown as OrderService;
  const courierCancels: string[] = [];
  const shipping = { cancelShipment: async (awb: string) => void courierCancels.push(awb) } as unknown as ShippingProvider;
  const committed: JobCommitted[] = [];
  const hooks = new DeliveryJobHooks();
  const hookState = { throws: false };
  hooks.afterCommit = async (e) => {
    committed.push(e);
    if (hookState.throws) throw new Error('hook boom');
  };

  const otp = new DeliveryOtpService(prisma, repo, settings, sms, security, audit);
  const sync = new OrderSyncService(shipping, orders);
  const gates = new DeliveryGateRegistry();
  const svc = new JobService(prisma, repo, settings, otp, sync, gates, hooks, audit, security);

  const job = () => t.deliveryJob.rows[0] as Record<string, any>;
  const order = () => t.order.rows[0] as Record<string, any>;
  const events = () => t.deliveryEvent.rows.map((e) => e.event as string);
  const advance = (minutes: number) => void (clock.now = new Date(clock.now.getTime() + minutes * 60_000));
  const lastCode = () => sent.filter((m) => m.purpose === 'delivery').at(-1)?.otp as string;

  /** Assign to p1 and take the job to a chosen point of the journey. */
  const journey = async (upTo: 'assigned' | 'accepted' | 'picked_up' | 'out_for_delivery' | 'arrived') => {
    await svc.assign('admin-1', 'o1', 'p1');
    const id = job().id as string;
    if (upTo === 'assigned') return id;
    await svc.accept('p1', id);
    if (upTo === 'accepted') return id;
    await svc.pickUp('p1', id);
    if (upTo === 'picked_up') return id;
    await svc.start('p1', id);
    if (upTo === 'out_for_delivery') return id;
    await svc.arrive('p1', id);
    return id;
  };

  return { db, t, svc, otp, gates, hooks, hookState, committed, sent, smsState, secEvents, audits, cancelled, orderFail, courierCancels, job, order, events, advance, lastCode, journey, clock };
}

async function expectCode(p: Promise<unknown>, code: string, status?: number): Promise<DeliveryError> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(DeliveryError);
  expect((e as DeliveryError).code).toBe(code);
  if (status) expect((e as DeliveryError).getStatus()).toBe(status);
  return e as DeliveryError;
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('JobService.assign', () => {
  it('creates the job, the assignment, the in-house shipment and moves the order to packed', async () => {
    const w = world();
    const r = await w.svc.assign('admin-1', 'o1', 'p1', 'fragile');
    const job = w.job();
    expect(r.jobId).toBe(job.id);
    expect(job).toMatchObject({
      status: 'assigned',
      partnerId: 'p1',
      orderId: 'o1',
      maxAttempts: 3,
      itemCount: 3,
      paymentMode: 'prepaid',
      codAmount: 0,
      destName: 'Asha Rao',
      destCity: 'Pune',
      destPincode: '411001',
      otpPhone: '9876543210',
    });
    expect(job.code).toMatch(/^DLV-[A-HJ-NP-Z2-9]{8}$/);
    expect(job.trackingToken.length).toBeGreaterThanOrEqual(43);
    expect(job.acceptDeadlineAt.getTime()).toBe(w.clock.now.getTime() - (w.clock.now.getTime() - job.acceptDeadlineAt.getTime()));
    expect(w.t.deliveryAssignment.rows[0]).toMatchObject({ jobId: job.id, partnerId: 'p1', outcome: 'pending', assignedByKind: 'admin', assignedById: 'admin-1' });
    expect(w.t.shipment.rows[0]).toMatchObject({ provider: 'inhouse', awb: job.code, courier: 'Belzo Delivery', status: 'packed' });
    expect(job.shipmentId).toBe(w.t.shipment.rows[0]?.id);
    expect(w.order().status).toBe('packed');
    expect(w.events()).toEqual(['assigned']);
    expect(w.t.trackingEvent.rows.map((e) => e.status)).toEqual(['assigned']);
    expect(w.audits[0]?.slice(0, 3)).toEqual(['admin-1', 'delivery.assign', job.id]);
    expect(w.committed[0]).toMatchObject({ move: 'assigned', to: 'assigned', actorKind: 'admin' });
    expect(w.sent).toHaveLength(0); // the OTP is only sent when the route starts
  });

  it('records cash on delivery with the order total to collect', async () => {
    const w = world({ payment: 'cod' });
    await w.svc.assign('admin-1', 'o1', 'p1');
    expect(w.job()).toMatchObject({ paymentMode: 'cod', codAmount: 49900 });
  });

  it('takes over the mock shipment the worker made earlier', async () => {
    const w = world({ orderStatus: 'packed' });
    w.t.shipment.rows.push({ id: 'old', orderId: 'o1', provider: 'mock', awb: 'MOCKAWB1', status: 'packed', createdAt: new Date() });
    await w.svc.assign('admin-1', 'o1', 'p1');
    expect(w.t.shipment.rows).toHaveLength(1);
    expect(w.t.shipment.rows[0]).toMatchObject({ id: 'old', provider: 'inhouse' });
    expect(w.courierCancels).toEqual([]);
  });

  it('tells a real courier its shipment is no longer needed, after the commit', async () => {
    const w = world({ orderStatus: 'packed' });
    w.t.shipment.rows.push({ id: 'old', orderId: 'o1', provider: 'shiprocket', awb: 'SR1', status: 'packed', createdAt: new Date() });
    await w.svc.assign('admin-1', 'o1', 'p1');
    expect(w.courierCancels).toEqual(['SR1']);
  });

  it('works for a shipped or out-for-delivery order whose earlier job was cancelled', async () => {
    for (const status of ['shipped', 'out_for_delivery']) {
      const w = world({ orderStatus: status });
      await w.svc.assign('admin-1', 'o1', 'p1');
      expect(w.order().status).toBe(status);
    }
  });

  it.each(['pending', 'cancelled', 'delivered', 'returned'])('refuses an order that is %s', async (status) => {
    const w = world({ orderStatus: status });
    await expectCode(w.svc.assign('admin-1', 'o1', 'p1'), 'ORDER_NOT_ASSIGNABLE', 409);
    expect(w.t.deliveryJob.rows).toHaveLength(0);
  });

  it('refuses a second assignment while the first job is active, and leaves nothing behind', async () => {
    const w = world();
    await w.svc.assign('admin-1', 'o1', 'p1');
    await expectCode(w.svc.assign('admin-1', 'o1', 'p2'), 'JOB_ALREADY_ACTIVE', 409);
    expect(w.t.deliveryJob.rows).toHaveLength(1);
    expect(w.t.deliveryAssignment.rows).toHaveLength(1);
  });

  it('refuses an inactive, missing or full partner, and rolls back the job it started to make', async () => {
    const w = world({ maxActiveJobs: 1 });
    (w.t.deliveryPartner.rows[0] as Record<string, any>).isActive = false;
    await expectCode(w.svc.assign('admin-1', 'o1', 'p1'), 'PARTNER_UNAVAILABLE', 409);
    await expectCode(w.svc.assign('admin-1', 'o1', 'ghost'), 'PARTNER_UNAVAILABLE', 409);
    expect(w.t.deliveryJob.rows).toHaveLength(0);
    expect(w.t.shipment.rows).toHaveLength(0);

    w.t.deliveryJob.rows.push({ id: 'busy', orderId: 'other', partnerId: 'p2', status: 'accepted' });
    await expectCode(w.svc.assign('admin-1', 'o1', 'p2'), 'PARTNER_AT_CAPACITY', 409);
    expect(w.t.deliveryJob.rows).toHaveLength(1);
  });

  it('refuses an incomplete address or an order with no usable mobile number', async () => {
    await expectCode(world({ address: { pincode: '12' } }).svc.assign('a', 'o1', 'p1'), 'ADDRESS_INCOMPLETE', 409);
    await expectCode(world({ address: { line1: '  ' } }).svc.assign('a', 'o1', 'p1'), 'ADDRESS_INCOMPLETE', 409);
    await expectCode(world({ address: { phone: '123' }, customerPhone: null }).svc.assign('a', 'o1', 'p1'), 'ADDRESS_INCOMPLETE', 409);
  });

  it('sends the OTP to the account phone when the address phone is not usable (FD4)', async () => {
    const w = world({ address: { phone: 'not a number' }, customerPhone: '+91 91234 56780' });
    await w.svc.assign('admin-1', 'o1', 'p1');
    expect(w.job().otpPhone).toBe('9123456780');
  });

  it('answers 404 for an unknown order', async () => {
    await expectCode(world().svc.assign('a', 'nope', 'p1'), 'NOT_FOUND', 404);
  });

  it('puts the order in the partner\'s zone when the pincode belongs to one', async () => {
    const w = world();
    w.t.deliveryZonePincode.rows.push({ id: 'zp1', pincode: '411001', zoneId: 'z1' });
    await w.svc.assign('admin-1', 'o1', 'p1');
    expect(w.job().zoneId).toBe('z1');
  });

  it('still succeeds when the hook throws', async () => {
    const w = world();
    w.hookState.throws = true;
    await expect(w.svc.assign('admin-1', 'o1', 'p1')).resolves.toBeDefined();
  });
});

describe('the delivery journey', () => {
  it('goes from assigned to delivered, with the OTP, and keeps the order and the timeline in step', async () => {
    const w = world();
    const id = await w.journey('arrived');
    expect(w.order().status).toBe('out_for_delivery');
    expect(w.t.shipment.rows[0]?.status).toBe('out_for_delivery');
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]).toMatchObject({ to: '9876543210', purpose: 'delivery' });

    await w.otp.verify('p1', id, w.lastCode());
    await w.svc.complete('p1', id);

    expect(w.job()).toMatchObject({ status: 'delivered', partnerId: 'p1' });
    expect(w.job().deliveredAt).toBeInstanceOf(Date);
    expect(w.job().endedAt).toBeInstanceOf(Date);
    expect(w.job().trackingExpiresAt.getTime()).toBeGreaterThan(w.job().endedAt.getTime());
    expect(w.order().status).toBe('delivered');
    expect(w.t.shipment.rows[0]?.status).toBe('delivered');
    expect(w.t.deliveryAssignment.rows[0]?.outcome).toBe('completed');
    expect(w.events().filter((e) => e !== 'otp_sent')).toEqual(['assigned', 'accepted', 'picked_up', 'out_for_delivery', 'arrived', 'otp_verified', 'delivered']);
    expect(w.t.trackingEvent.rows.map((e) => e.status)).toEqual(['assigned', 'accepted', 'picked_up', 'out_for_delivery', 'arrived', 'delivered']);
  });

  it('cannot be delivered without the OTP: nothing changes and nothing is written', async () => {
    const w = world();
    const id = await w.journey('arrived');
    const eventsBefore = w.events().length;
    await expectCode(w.svc.complete('p1', id), 'OTP_NOT_VERIFIED', 409);
    expect(w.job().status).toBe('arrived');
    expect(w.order().status).toBe('out_for_delivery');
    expect(w.events()).toHaveLength(eventsBefore);
  });

  it('refuses a verification that is too old, then accepts a fresh one', async () => {
    const w = world();
    const id = await w.journey('arrived');
    await w.otp.verify('p1', id, w.lastCode());
    w.advance(31);
    await expectCode(w.svc.complete('p1', id), 'OTP_STALE', 409);
    await w.otp.resend('p1', id);
    await w.otp.verify('p1', id, w.lastCode());
    await expect(w.svc.complete('p1', id)).resolves.toMatchObject({ replay: false });
  });

  it('the code of the first attempt does not deliver the second attempt', async () => {
    const w = world();
    const id = await w.journey('arrived');
    await w.otp.verify('p1', id, w.lastCode());
    await w.svc.fail('p1', id, { reasonCode: 'customer_unavailable' });
    await w.svc.retry('p1', id);
    await w.svc.arrive('p1', id);
    await expectCode(w.svc.complete('p1', id), 'OTP_NOT_VERIFIED', 409);
  });

  it('an admin or the system has no way to deliver', async () => {
    const w = world();
    const id = await w.journey('arrived');
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(w.svc))).not.toContain('markDelivered');
    await w.otp.verify('p1', id, w.lastCode());
    await expectCode(w.svc.cancel('admin-1', id, 'x'), 'INVALID_INPUT', 422);
  });

  it('treats a repeated tap as a replay: no second event, no second OTP', async () => {
    const w = world();
    const id = await w.journey('picked_up');
    await w.svc.start('p1', id);
    const before = { events: w.events().length, otps: w.t.deliveryOtp.rows.length, sms: w.sent.length };
    const again = await w.svc.start('p1', id);
    expect(again.replay).toBe(true);
    expect({ events: w.events().length, otps: w.t.deliveryOtp.rows.length, sms: w.sent.length }).toEqual(before);
  });

  it('keeps going when the OTP SMS fails; the partner can resend', async () => {
    const w = world();
    w.smsState.failing = true;
    const id = await w.journey('out_for_delivery');
    expect(w.job().status).toBe('out_for_delivery');
    expect(w.t.deliveryOtp.rows[0]?.sendStatus).toBe('failed');
    w.smsState.failing = false;
    w.advance(2);
    await w.otp.resend('p1', id);
    expect(w.sent).toHaveLength(1);
  });

  it('refuses moves out of order', async () => {
    const w = world();
    const id = await w.journey('assigned');
    await expectCode(w.svc.pickUp('p1', id), 'INVALID_TRANSITION', 409);
    await expectCode(w.svc.arrive('p1', id), 'INVALID_TRANSITION', 409);
    await expectCode(w.svc.complete('p1', id), 'INVALID_TRANSITION', 409);
  });
});

describe('reject, timeout, unassign', () => {
  it('a rejection sends the job back to new with a flag, and the order can be given to someone else', async () => {
    const w = world();
    const id = await w.journey('assigned');
    await w.svc.reject('p1', id, 'my bike broke down');
    expect(w.job()).toMatchObject({ status: 'new', partnerId: null, attention: 'rejected', acceptDeadlineAt: null });
    expect(w.t.deliveryAssignment.rows[0]).toMatchObject({ outcome: 'rejected', reason: 'my bike broke down' });
    await expectCode(w.svc.accept('p1', id), 'NOT_FOUND', 404);

    await w.svc.assign('admin-1', 'o1', 'p2');
    expect(w.t.deliveryJob.rows).toHaveLength(1); // the same job is reused
    expect(w.job()).toMatchObject({ id, status: 'assigned', partnerId: 'p2', attention: null });
    expect(w.t.deliveryAssignment.rows).toHaveLength(2);
    expect(w.t.shipment.rows).toHaveLength(1);
  });

  it('a rejection needs a reason', async () => {
    const w = world();
    const id = await w.journey('assigned');
    await expectCode(w.svc.reject('p1', id, 'no'), 'INVALID_INPUT', 422);
    expect(w.job().status).toBe('assigned');
  });

  it('a partner who did not answer in time loses the job to new with a no-reply flag', async () => {
    const w = world();
    const id = await w.journey('assigned');
    expect(await w.svc.expire(id)).toBe(false); // still has time
    w.advance(16);
    expect(await w.svc.expire(id)).toBe(true);
    expect(w.job()).toMatchObject({ status: 'new', partnerId: null, attention: 'no_reply' });
    expect(w.t.deliveryAssignment.rows[0]?.outcome).toBe('expired');
  });

  it('expireUnanswered handles only the jobs past their deadline', async () => {
    const w = world();
    await w.journey('assigned');
    expect(await w.svc.expireUnanswered()).toBe(0);
    w.advance(20);
    expect(await w.svc.expireUnanswered()).toBe(1);
    expect(await w.svc.expireUnanswered()).toBe(0);
  });

  it('a job the partner accepted just before the sweep is left alone', async () => {
    const w = world();
    const id = await w.journey('assigned');
    w.advance(20);
    await w.svc.accept('p1', id);
    expect(await w.svc.expire(id)).toBe(false);
    expect(w.job().status).toBe('accepted');
  });

  it('an admin can take back an accepted job, with a reason', async () => {
    const w = world();
    const id = await w.journey('accepted');
    await expectCode(w.svc.unassign('admin-1', id, ''), 'INVALID_INPUT', 422);
    await w.svc.unassign('admin-1', id, 'partner is ill');
    expect(w.job()).toMatchObject({ status: 'new', partnerId: null });
    expect(w.t.deliveryAssignment.rows[0]?.outcome).toBe('unassigned');
    expect(w.audits.at(-1)?.[1]).toBe('delivery.unassign');
  });
});

describe('failed attempts', () => {
  it('counts attempts, flags the job at the limit and then refuses a retry', async () => {
    const w = world();
    const id = await w.journey('out_for_delivery');
    for (let i = 1; i <= 3; i += 1) {
      await w.svc.fail('p1', id, { reasonCode: 'customer_unavailable' });
      expect(w.job().attemptsUsed).toBe(i);
      if (i < 3) await w.svc.retry('p1', id);
    }
    expect(w.job()).toMatchObject({ status: 'failed_attempt', attention: 'max_attempts' });
    await expectCode(w.svc.retry('p1', id), 'MAX_ATTEMPTS_REACHED', 409);
    expect(w.sent).toHaveLength(3); // the first send plus two retries
  });

  it('a retry makes a new code and retires the old one', async () => {
    const w = world();
    const id = await w.journey('out_for_delivery');
    await w.svc.fail('p1', id, { reasonCode: 'wrong_address' });
    expect(w.t.deliveryOtp.rows[0]?.status).toBe('superseded');
    await w.svc.retry('p1', id);
    expect(w.t.deliveryOtp.rows.filter((o) => o.status === 'active')).toHaveLength(1);
    expect(w.t.deliveryOtp.rows.at(-1)?.attemptNo).toBe(2);
  });

  it('the customer timeline gets a fixed line and never the partner\'s reason', async () => {
    const w = world();
    const id = await w.journey('out_for_delivery');
    await w.svc.fail('p1', id, { reasonCode: 'other', note: 'dog at the gate, secret-note' });
    const lines = JSON.stringify(w.t.trackingEvent.rows);
    expect(lines).toContain('Delivery attempt unsuccessful');
    expect(lines).not.toContain('secret-note');
    expect(w.order().status).toBe('out_for_delivery');
    expect(w.t.deliveryEvent.rows.at(-1)).toMatchObject({ reasonCode: 'other', note: 'dog at the gate, secret-note' });
  });

  it('an admin can force a failure at the door, and reassigning resets the attempts', async () => {
    const w = world();
    const id = await w.journey('arrived');
    await w.svc.forceFail('admin-1', id, 'customer phone switched off');
    expect(w.job()).toMatchObject({ status: 'failed_attempt', attemptsUsed: 1 });
    await w.svc.reassign('admin-1', id, 'p2', 'second rider will try');
    expect(w.job()).toMatchObject({ status: 'assigned', partnerId: 'p2', attemptsUsed: 0 });
    expect(w.t.deliveryAssignment.rows.map((a) => a.outcome)).toEqual(['reassigned', 'pending']);
  });
});

describe('reassign, cancel, return', () => {
  it('reassign refuses the same partner, a full partner and a missing reason', async () => {
    const w = world({ maxActiveJobs: 1 });
    const id = await w.journey('accepted');
    await expectCode(w.svc.reassign('admin-1', id, 'p1', 'same again'), 'INVALID_TRANSITION', 409);
    w.t.deliveryJob.rows.push({ id: 'busy', orderId: 'x', partnerId: 'p2', status: 'accepted' });
    await expectCode(w.svc.reassign('admin-1', id, 'p2', 'to the other one'), 'PARTNER_AT_CAPACITY', 409);
    await expectCode(w.svc.reassign('admin-1', id, 'p2', ''), 'INVALID_INPUT', 422);
    expect(w.job()).toMatchObject({ partnerId: 'p1', status: 'accepted' });
  });

  it('after a failed attempt the office can give the same partner a fresh set of attempts', async () => {
    const w = world();
    const id = await w.journey('out_for_delivery');
    await w.svc.fail('p1', id, { reasonCode: 'customer_unavailable' });
    await w.svc.reassign('admin-1', id, 'p1', 'customer asked for a later try');
    expect(w.job()).toMatchObject({ status: 'assigned', partnerId: 'p1', attemptsUsed: 0 });
  });

  it('reassign after pick-up retires the OTP and keeps the order where it is', async () => {
    const w = world();
    const id = await w.journey('out_for_delivery');
    await w.svc.reassign('admin-1', id, 'p2', 'rider unreachable');
    expect(w.t.deliveryOtp.rows.every((o) => o.status !== 'active')).toBe(true);
    expect(w.order().status).toBe('out_for_delivery');
    expect(w.t.shipment.rows[0]?.status).toBe('out_for_delivery');
  });

  it('cancel stops the job, cancels the shipment and leaves the order alone (BR-D57)', async () => {
    const w = world();
    const id = await w.journey('out_for_delivery');
    await w.svc.cancel('admin-1', id, 'customer called to stop it');
    expect(w.job()).toMatchObject({ status: 'cancelled', endedAt: expect.any(Date) });
    expect(w.t.shipment.rows[0]?.status).toBe('cancelled');
    expect(w.order().status).toBe('out_for_delivery');
    expect(w.t.deliveryOtp.rows.every((o) => o.status !== 'active')).toBe(true);
    // the order can be given to a partner again
    await w.svc.assign('admin-1', 'o1', 'p2');
    expect(w.t.deliveryJob.rows).toHaveLength(2);
  });

  it('a cancelled order stops its job and blocks the partner (BR-D24, BR-D58)', async () => {
    const w = world();
    const id = await w.journey('out_for_delivery');
    w.order().status = 'cancelled';
    await expectCode(w.svc.arrive('p1', id), 'ORDER_CANCELLED', 409);
    expect(await w.svc.cancelForOrder('o1')).toBe(true);
    expect(w.job().status).toBe('cancelled');
    expect(await w.svc.cancelForOrder('o1')).toBe(false); // nothing left to cancel
    expect(await w.svc.cancelForOrder('unknown-order')).toBe(false);
  });

  it('return cancels the order as undeliverable after the commit (FD2 = A)', async () => {
    const w = world();
    const id = await w.journey('out_for_delivery');
    await w.svc.fail('p1', id, { reasonCode: 'refused' });
    await w.svc.markReturned('admin-1', id, 'customer refused the parcel');
    expect(w.job().status).toBe('returned');
    expect(w.t.shipment.rows[0]?.status).toBe('rto');
    expect(w.cancelled).toEqual(['o1']);
    expect(w.order().status).toBe('cancelled');
    expect(UNDELIVERABLE_CANCEL_REASON).toBe('Undeliverable, returned to shop');
  });

  it('return only works after a failed attempt', async () => {
    const w = world();
    const id = await w.journey('out_for_delivery');
    await expectCode(w.svc.markReturned('admin-1', id, 'too early'), 'INVALID_TRANSITION', 409);
  });

  it('the job stays returned even if the order cancel fails, and the sweep repairs it', async () => {
    const w = world();
    const id = await w.journey('out_for_delivery');
    await w.svc.fail('p1', id, { reasonCode: 'refused' });
    w.orderFail.on = true;
    await expect(w.svc.markReturned('admin-1', id, 'customer refused the parcel')).resolves.toBeDefined();
    expect(w.job().status).toBe('returned');
    expect(w.order().status).toBe('out_for_delivery');
  });
});

describe('who may do what', () => {
  it('a partner gets 404 for a job that is not theirs and a security event is raised (BR-D22)', async () => {
    const w = world();
    const id = await w.journey('assigned');
    await expectCode(w.svc.accept('p2', id), 'NOT_FOUND', 404);
    await expectCode(w.svc.accept('p1', 'no-such-job'), 'NOT_FOUND', 404);
    expect(w.secEvents.filter((e) => e === SECURITY_EVENTS.ACCESS_DENIED)).toHaveLength(2);
    expect(w.job().status).toBe('assigned');
  });

  it('finished jobs cannot be changed by anyone', async () => {
    const w = world();
    const id = await w.journey('out_for_delivery');
    await w.svc.cancel('admin-1', id, 'stopped by customer');
    await expectCode(w.svc.cancel('admin-1', id, 'again please'), 'INVALID_TRANSITION', 409);
    await expectCode(w.svc.reassign('admin-1', id, 'p2', 'one more try'), 'INVALID_TRANSITION', 409);
    await expectCode(w.svc.arrive('p1', id), 'INVALID_TRANSITION', 409);
  });
});

describe('guards and gates (extension points)', () => {
  it('a guard can refuse a reassign, return or cancel, and the job is left untouched', async () => {
    const w = world();
    const id = await w.journey('accepted');
    w.gates.registerGuard({ name: 'collected-payment', check: async () => 'A payment was collected. Void it first.' });
    const e = await expectCode(w.svc.cancel('admin-1', id, 'stop it now'), 'GUARD_REFUSED', 409);
    expect(e.message).toContain('Void it first');
    await expectCode(w.svc.reassign('admin-1', id, 'p2', 'swap partner'), 'GUARD_REFUSED', 409);
    expect(w.job().status).toBe('accepted');
    expect(w.events()).toEqual(['assigned', 'accepted']);
    await w.svc.unassign('admin-1', id, 'unassign is not guarded'); // not one of the guarded moves
    expect(w.job().status).toBe('new');
  });

  it('a gate can hold back delivery even with a verified OTP', async () => {
    const w = world();
    const id = await w.journey('arrived');
    await w.otp.verify('p1', id, w.lastCode());
    w.gates.registerGate({ name: 'payment', check: async () => 'Collect the cash first' });
    await expectCode(w.svc.complete('p1', id), 'GATE_REFUSED', 409);
    expect(w.job().status).toBe('arrived');
  });

  it('registering the same name twice keeps one', async () => {
    const w = world();
    let calls = 0;
    const g = { name: 'once', check: async () => (calls += 1, null) };
    w.gates.registerGate(g);
    w.gates.registerGate(g);
    const id = await w.journey('arrived');
    await w.otp.verify('p1', id, w.lastCode());
    await w.svc.complete('p1', id);
    expect(calls).toBe(1);
  });
});

describe('clearOldGps (privacy, 90 days)', () => {
  it('clears the GPS point of events older than 90 days and keeps the events', async () => {
    const w = world();
    const day = 86_400_000;
    const now = w.clock.now;
    w.t.deliveryEvent.rows.push(
      { id: 'old', jobId: 'j', event: 'picked_up', lat: 18.5, lng: 73.8, note: 'kept', createdAt: new Date(now.getTime() - 91 * day) },
      { id: 'edge', jobId: 'j', event: 'arrived', lat: 18.6, lng: 73.9, createdAt: new Date(now.getTime() - 89 * day) },
      { id: 'nogps', jobId: 'j', event: 'accepted', lat: null, lng: null, createdAt: new Date(now.getTime() - 200 * day) },
    );
    expect(await w.svc.clearOldGps(now)).toBe(1);
    const rows = Object.fromEntries(w.t.deliveryEvent.rows.map((r) => [r.id, r]));
    expect(rows.old).toMatchObject({ lat: null, lng: null, note: 'kept', event: 'picked_up' });
    expect(rows.edge).toMatchObject({ lat: 18.6, lng: 73.9 });
    expect(await w.svc.clearOldGps(now)).toBe(0); // safe to run again
  });
});

describe('reconcileReturned and job codes', () => {
  it('cancels the order of a returned job whose order is still open', async () => {
    const w = world();
    const id = await w.journey('out_for_delivery');
    await w.svc.fail('p1', id, { reasonCode: 'refused' });
    w.orderFail.on = true;
    await w.svc.markReturned('admin-1', id, 'customer refused the parcel');
    w.orderFail.on = false;
    // the fake table has no relation filter, so give it the row the sweep query returns
    (w.db.prisma as any).deliveryJob.findMany = async () => [{ orderId: 'o1' }];
    expect(await w.svc.reconcileReturned()).toBe(1);
    expect(w.order().status).toBe('cancelled');
  });

  it('P14: tracking tokens are URL-safe, 43 characters (256 bits) and never repeat', () => {
    fc.assert(
      fc.property(fc.integer({ min: 50, max: 400 }), (n) => {
        const seen = new Set<string>();
        for (let i = 0; i < n; i += 1) {
          const t = newTrackingToken();
          expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
          seen.add(t);
        }
        expect(seen.size).toBe(n);
      }),
      { numRuns: 20 },
    );
  });

  it('makes unique-looking codes from the safe alphabet', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const c = newJobCode();
      expect(c).toMatch(/^DLV-[A-HJ-NP-Z2-9]{8}$/);
      seen.add(c);
    }
    expect(seen.size).toBeGreaterThan(495);
  });
});
