/**
 * Database-level checks for the delivery module (U8.1, Step 15).
 *
 * These run against a real PostgreSQL with all migrations applied, because the guarantees they test live in
 * the database itself: partial unique indexes, append-only and final-status triggers, the "delivered needs a
 * verified OTP" trigger, check constraints, row locks and the real Prisma queries of the services.
 *
 * They are skipped unless DELIVERY_DB_TEST_URL is set, so a normal `jest` run needs no database:
 *
 *   createdb belzo_delivery_scratch && DATABASE_URL=<url> npx prisma migrate deploy
 *   DELIVERY_DB_TEST_URL=<url> npx jest src/modules/delivery/delivery.db.spec.ts
 */
import { Logger } from '@nestjs/common';
import { DEFAULT_DELIVERY_SETTINGS } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditLogService } from '../admin/audit-log.service';
import type { DeliverySettingsService } from './settings/delivery-settings.service';
import type { DeliverySecurityEvents } from './security-events';
import type { OrderService } from '../orders/order.service';
import type { ShippingProvider } from '../../integrations/shipping/shipping.provider';
import type { SmsMessage, SmsProvider } from '../../integrations/sms/sms.provider';
import { DeliveryError } from './delivery-errors';
import { DeliveryGateRegistry, DeliveryJobHooks } from './jobs/gates';
import { JobQueryService } from './jobs/job-query.service';
import { JobRepository } from './jobs/job.repository';
import { JobService } from './jobs/job.service';
import { OrderSyncService } from './jobs/order-sync.service';
import { DeliveryOtpService } from './otp/delivery-otp.service';
import { PartnerService } from './partners/partner.service';
import type { PartnerTokenService } from './partners/partner-token.service';
import type { PasswordService } from '../identity/password.service';

const URL = process.env.DELIVERY_DB_TEST_URL;
const d = URL ? describe : describe.skip;

process.env.DELIVERY_OTP_PEPPER = 'pepper-for-db-tests-0123456789abcdefghij';

d('delivery module against a real database', () => {
  jest.setTimeout(60_000);
  let prisma: PrismaService;
  let jobs: JobService;
  let otp: DeliveryOtpService;
  let query: JobQueryService;
  const sent: SmsMessage[] = [];
  const cancelledOrders: string[] = [];

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    process.env.DATABASE_URL = URL;
    prisma = new PrismaService();
    await prisma.onModuleInit();

    const repo = new JobRepository(prisma);
    const settings = { get: async () => DEFAULT_DELIVERY_SETTINGS } as unknown as DeliverySettingsService;
    const sms: SmsProvider = { send: async (m) => (sent.push(m), { messageId: 'm' }) };
    const security = { record: async () => undefined, counters24h: async () => ({ failedLogins24h: 0, lockedLogins24h: 0, otpLocks24h: 0, foreignJobAttempts24h: 0 }) } as unknown as DeliverySecurityEvents;
    const audit = new AuditLogService(prisma);
    otp = new DeliveryOtpService(prisma, repo, settings, sms, security, audit);
    const orders = {
      cancelUndeliverable: async (id: string) => {
        cancelledOrders.push(id);
        await prisma.order.update({ where: { id }, data: { status: 'cancelled', cancelledReason: 'Undeliverable, returned to shop' } });
      },
    } as unknown as OrderService;
    const shipping = { cancelShipment: async () => undefined } as unknown as ShippingProvider;
    const sync = new OrderSyncService(shipping, orders);
    jobs = new JobService(prisma, repo, settings, otp, sync, new DeliveryGateRegistry(), new DeliveryJobHooks(), audit, security);
    const partners = new PartnerService(prisma, {} as PasswordService, audit, {} as PartnerTokenService, repo, settings);
    query = new JobQueryService(prisma, repo, settings, otp, partners, security);
  });

  afterAll(async () => {
    await prisma?.onModuleDestroy();
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    sent.length = 0;
    cancelledOrders.length = 0;
    await prisma.$executeRawUnsafe(
      'TRUNCATE delivery_events, delivery_otps, delivery_assignments, delivery_jobs, delivery_partner_zones, delivery_partners, delivery_zone_pincodes, delivery_zones, tracking_events, shipments, payments, order_items, orders, addresses, customers, admin_audit_logs CASCADE',
    );
  });

  // ───────────────────────── seed helpers ─────────────────────────

  let n = 0;
  async function seedOrder(over: { status?: 'confirmed' | 'packed'; cod?: boolean } = {}) {
    n += 1;
    const customer = await prisma.customer.create({ data: { name: 'Asha Rao', phone: `99999${String(10000 + n)}`, email: `a${n}@example.com` } });
    const address = await prisma.address.create({
      data: { customerId: customer.id, fullName: 'Asha Rao', phone: '9876543210', line1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
    });
    return prisma.order.create({
      data: {
        customerId: customer.id,
        addressId: address.id,
        status: over.status ?? 'confirmed',
        idempotencyKey: `idem-${n}-${Math.random()}`,
        subtotal: 49900, discount: 0, shipping: 0, codFee: 0, tax: 0, cgst: 0, sgst: 0, igst: 0, grandTotal: 49900,
        items: { create: [{ variantId: 'v1', title: 'Rice 5kg', sku: 'RICE5', unitPrice: 24950, quantity: 2, taxRatePct: 5 }] },
        payments: { create: [{ provider: over.cod ? 'cod' : 'razorpay', amount: 49900, status: over.cod ? 'pending' : 'captured' }] },
      },
    });
  }
  const seedPartner = (mobile = '9876501234', over: Record<string, unknown> = {}) =>
    prisma.deliveryPartner.create({ data: { name: `Partner ${mobile}`, mobile, passwordHash: 'x', ...over } });

  async function rawJob(orderId: string, status = 'new', code = `DLV-${Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, 'A')}`) {
    return prisma.$executeRawUnsafe(
      `INSERT INTO delivery_jobs (id, code, "orderId", status, "maxAttempts", "paymentMode", "itemCount", "destName", "destPhone", "destLine1", "destCity", "destState", "destPincode", "otpPhone", "trackingToken", "updatedAt")
       VALUES (gen_random_uuid()::text, '${code}', '${orderId}', '${status}'::"DeliveryStatus", 3, 'cod', 1, 'A', '9876543210', 'L1', 'Pune', 'MH', '411001', '9876543210', gen_random_uuid()::text, now())`,
    );
  }
  const sqlError = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e as Error))?.message ?? null;

  // ───────────────────────── schema guarantees ─────────────────────────

  describe('indexes, triggers and checks', () => {
    it('allows only one active job per order, and a new one once the old one has ended', async () => {
      const o = await seedOrder();
      await rawJob(o.id, 'new');
      expect(await sqlError(rawJob(o.id, 'assigned'))).toMatch(/23505|already exists|unique/i);
      await prisma.$executeRawUnsafe(`UPDATE delivery_jobs SET status = 'cancelled' WHERE "orderId" = '${o.id}'`);
      await expect(rawJob(o.id, 'new')).resolves.toBeDefined();
    });

    it('a job cannot be created already delivered or returned', async () => {
      const o = await seedOrder();
      expect(await sqlError(rawJob(o.id, 'delivered'))).toMatch(/cannot be created/);
      expect(await sqlError(rawJob(o.id, 'returned'))).toMatch(/cannot be created/);
    });

    it('a finished job cannot change status', async () => {
      const o = await seedOrder();
      await rawJob(o.id, 'new');
      await prisma.$executeRawUnsafe(`UPDATE delivery_jobs SET status = 'cancelled' WHERE "orderId" = '${o.id}'`);
      expect(await sqlError(prisma.$executeRawUnsafe(`UPDATE delivery_jobs SET status = 'assigned' WHERE "orderId" = '${o.id}'`))).toMatch(/cannot change status/);
    });

    it('delivered needs the arrived status and a verified OTP, in the database itself', async () => {
      const o = await seedOrder();
      await rawJob(o.id, 'new');
      const job = await prisma.deliveryJob.findFirstOrThrow({ where: { orderId: o.id } });
      await prisma.$executeRawUnsafe(`UPDATE delivery_jobs SET status = 'accepted' WHERE id = '${job.id}'`);
      expect(await sqlError(prisma.$executeRawUnsafe(`UPDATE delivery_jobs SET status = 'delivered' WHERE id = '${job.id}'`))).toMatch(/only be delivered from arrived/);
      await prisma.$executeRawUnsafe(`UPDATE delivery_jobs SET status = 'arrived' WHERE id = '${job.id}'`);
      expect(await sqlError(prisma.$executeRawUnsafe(`UPDATE delivery_jobs SET status = 'delivered' WHERE id = '${job.id}'`))).toMatch(/without a verified OTP/);
      await prisma.deliveryOtp.create({ data: { jobId: job.id, attemptNo: 1, phone: '9876543210', codeHash: 'h', status: 'verified', verifiedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } });
      await expect(prisma.$executeRawUnsafe(`UPDATE delivery_jobs SET status = 'delivered' WHERE id = '${job.id}'`)).resolves.toBe(1);
    });

    it('events are append-only, except clearing the GPS point', async () => {
      const o = await seedOrder();
      await rawJob(o.id, 'new');
      const job = await prisma.deliveryJob.findFirstOrThrow({ where: { orderId: o.id } });
      const ev = await prisma.deliveryEvent.create({ data: { jobId: job.id, event: 'picked_up', actorKind: 'partner', note: 'x', lat: 18.5, lng: 73.8 } });
      expect(await sqlError(prisma.$executeRawUnsafe(`UPDATE delivery_events SET note = 'changed' WHERE id = '${ev.id}'`))).toMatch(/append-only/);
      expect(await sqlError(prisma.$executeRawUnsafe(`DELETE FROM delivery_events WHERE id = '${ev.id}'`))).toMatch(/append-only/);
      expect(await sqlError(prisma.$executeRawUnsafe(`UPDATE delivery_events SET lat = NULL, lng = NULL, note = 'changed' WHERE id = '${ev.id}'`))).toMatch(/append-only/);
      await expect(prisma.$executeRawUnsafe(`UPDATE delivery_events SET lat = NULL, lng = NULL WHERE id = '${ev.id}'`)).resolves.toBe(1);
      const after = await prisma.deliveryEvent.findUniqueOrThrow({ where: { id: ev.id } });
      expect(after).toMatchObject({ lat: null, lng: null, note: 'x', event: 'picked_up' });
    });

    it('the privacy clean-up may clear old GPS points through the trigger, and changes nothing else', async () => {
      const order = await seedOrder();
      const p = await seedPartner();
      const { jobId } = await jobs.assign('a1', order.id, p.id);
      await jobs.accept(p.id, jobId);
      await jobs.pickUp(p.id, jobId, { lat: 18.5, lng: 73.8 });
      const old = await prisma.deliveryEvent.findFirstOrThrow({ where: { jobId, event: 'picked_up' } });
      expect(old.lat).toBe(18.5);
      const future = new Date(Date.now() + 91 * 86_400_000);
      expect(await jobs.clearOldGps(future)).toBe(1);
      const after = await prisma.deliveryEvent.findUniqueOrThrow({ where: { id: old.id } });
      expect(after).toMatchObject({ lat: null, lng: null, event: 'picked_up', actorKind: 'partner' });
      expect(after.createdAt.getTime()).toBe(old.createdAt.getTime());
    });

    it('one active OTP per job and one open assignment per job', async () => {
      const o = await seedOrder();
      const p = await seedPartner();
      await rawJob(o.id, 'new');
      const job = await prisma.deliveryJob.findFirstOrThrow({ where: { orderId: o.id } });
      const otp = { jobId: job.id, attemptNo: 1, phone: '9876543210', codeHash: 'h', expiresAt: new Date(Date.now() + 60_000) };
      await prisma.deliveryOtp.create({ data: otp });
      expect(await sqlError(prisma.deliveryOtp.create({ data: otp }))).toMatch(/one_active_per_job|Unique/i);
      await prisma.deliveryAssignment.create({ data: { jobId: job.id, partnerId: p.id, assignedByKind: 'admin' } });
      expect(await sqlError(prisma.deliveryAssignment.create({ data: { jobId: job.id, partnerId: p.id, assignedByKind: 'admin' } }))).toMatch(/one_open_per_job|Unique/i);
    });

    it('refuses badly formed mobiles, pincodes and counters', async () => {
      expect(await sqlError(seedPartner('1234567890'))).toMatch(/mobile_chk|check/i);
      expect(await sqlError(prisma.deliveryPartner.create({ data: { name: 'X Y', mobile: '9876500000', passwordHash: 'x', maxActiveJobs: 0 } }))).toMatch(/max_active_chk|check/i);
      const zone = await prisma.deliveryZone.create({ data: { name: 'Z1' } });
      expect(await sqlError(prisma.deliveryZonePincode.create({ data: { zoneId: zone.id, pincode: '012345' } }))).toMatch(/pincode_chk|check/i);
      const o = await seedOrder();
      expect(await sqlError(prisma.$executeRawUnsafe(`UPDATE orders SET status = status WHERE id = '${o.id}'`))).toBeNull();
    });

    it('keeps a pincode in one zone only', async () => {
      const a = await prisma.deliveryZone.create({ data: { name: 'A' } });
      const b = await prisma.deliveryZone.create({ data: { name: 'B' } });
      await prisma.deliveryZonePincode.create({ data: { zoneId: a.id, pincode: '411001' } });
      expect(await sqlError(prisma.deliveryZonePincode.create({ data: { zoneId: b.id, pincode: '411001' } }))).toMatch(/Unique|unique/);
    });
  });

  // ───────────────────────── the services on the real database ─────────────────────────

  describe('a whole delivery', () => {
    it('assign to delivered: job, assignment, shipment, order, tracking and events all agree', async () => {
      const order = await seedOrder({ cod: true });
      const p = await seedPartner();
      const { jobId } = await jobs.assign('admin-1', order.id, p.id, 'handle with care');

      await jobs.accept(p.id, jobId);
      await jobs.pickUp(p.id, jobId, { lat: 18.5, lng: 73.8 });
      await jobs.start(p.id, jobId);
      expect(sent).toHaveLength(1);
      await jobs.arrive(p.id, jobId);

      await expect(jobs.complete(p.id, jobId)).rejects.toMatchObject({ code: 'OTP_NOT_VERIFIED' });
      await otp.verify(p.id, jobId, sent[0]?.otp as string);
      await jobs.complete(p.id, jobId);

      const job = await prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
      expect(job).toMatchObject({ status: 'delivered', partnerId: p.id, paymentMode: 'cod', codAmount: 49900, attemptsUsed: 0 });
      expect(job.deliveredAt).toBeInstanceOf(Date);
      expect(job.trackingExpiresAt && job.endedAt && job.trackingExpiresAt > job.endedAt).toBe(true);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('delivered');
      const ship = await prisma.shipment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(ship).toMatchObject({ provider: 'inhouse', awb: job.code, status: 'delivered' });
      expect((await prisma.trackingEvent.findMany({ where: { shipmentId: ship.id }, orderBy: { occurredAt: 'asc' } })).map((t) => t.status)).toEqual([
        'assigned', 'accepted', 'picked_up', 'out_for_delivery', 'arrived', 'delivered',
      ]);
      expect((await prisma.deliveryAssignment.findMany({ where: { jobId } })).map((a) => a.outcome)).toEqual(['completed']);
      const events = await prisma.deliveryEvent.findMany({ where: { jobId }, orderBy: { createdAt: 'asc' } });
      expect(events.map((e) => e.event).filter((e) => e !== 'otp_sent')).toEqual(['assigned', 'accepted', 'picked_up', 'out_for_delivery', 'arrived', 'otp_verified', 'delivered']);
      expect(JSON.stringify(events)).not.toContain(sent[0]?.otp as string);
      expect(await prisma.deliveryOtp.count({ where: { jobId, codeHash: sent[0]?.otp as string } })).toBe(0);
    });

    it('two staff members assigning the same order at the same moment: exactly one wins', async () => {
      const order = await seedOrder();
      const p1 = await seedPartner('9876501111');
      const p2 = await seedPartner('9876502222');
      const results = await Promise.allSettled([jobs.assign('a1', order.id, p1.id), jobs.assign('a2', order.id, p2.id)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await prisma.deliveryJob.count({ where: { orderId: order.id } })).toBe(1);
      expect(await prisma.deliveryAssignment.count()).toBe(1);
      expect(await prisma.shipment.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('a partner who accepts at the same moment the timeout runs: one of them wins and the data stays consistent', async () => {
      const order = await seedOrder();
      const p = await seedPartner();
      const { jobId } = await jobs.assign('a1', order.id, p.id);
      await prisma.deliveryJob.update({ where: { id: jobId }, data: { acceptDeadlineAt: new Date(Date.now() - 1000) } });
      const [accepted, expired] = await Promise.allSettled([jobs.accept(p.id, jobId), jobs.expire(jobId)]);
      const job = await prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
      if (job.status === 'accepted') {
        expect(accepted.status).toBe('fulfilled');
        expect(expired.status === 'fulfilled' ? (expired as PromiseFulfilledResult<boolean>).value : false).toBe(false);
        expect(job.partnerId).toBe(p.id);
      } else {
        expect(job).toMatchObject({ status: 'new', partnerId: null, attention: 'no_reply' });
        expect(accepted.status).toBe('rejected');
      }
      expect(await prisma.deliveryAssignment.count({ where: { jobId, outcome: { in: ['pending', 'accepted'] } } })).toBeLessThanOrEqual(1);
    });

    it('wrong OTP guesses are kept even though the call fails, and the fifth locks the job', async () => {
      const order = await seedOrder();
      const p = await seedPartner();
      const { jobId } = await jobs.assign('a1', order.id, p.id);
      await jobs.accept(p.id, jobId);
      await jobs.pickUp(p.id, jobId);
      await jobs.start(p.id, jobId);
      await jobs.arrive(p.id, jobId);
      const real = sent[0]?.otp as string;
      const wrong = real === '000000' ? '111111' : '000000';
      for (let i = 1; i <= 4; i += 1) {
        await expect(otp.verify(p.id, jobId, wrong)).rejects.toMatchObject({ code: 'OTP_INVALID' });
        expect((await prisma.deliveryOtp.findFirstOrThrow({ where: { jobId, status: 'active' } })).wrongGuesses).toBe(i);
      }
      await expect(otp.verify(p.id, jobId, wrong)).rejects.toMatchObject({ code: 'OTP_LOCKED' });
      const job = await prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } });
      expect(job.otpLockedUntil && job.otpLockedUntil > new Date()).toBe(true);
      await expect(otp.verify(p.id, jobId, real)).rejects.toMatchObject({ code: 'OTP_LOCKED' });
      await otp.adminUnlock('admin-1', jobId);
      await expect(otp.verify(p.id, jobId, real)).rejects.toMatchObject({ code: 'OTP_EXPIRED' }); // the locked code is dead: send a new one
    });

    it('a failed step leaves nothing half written (rollback)', async () => {
      const order = await seedOrder();
      const p = await seedPartner('9876503333', { maxActiveJobs: 1 });
      const other = await seedOrder();
      await jobs.assign('a1', other.id, p.id);
      await expect(jobs.assign('a1', order.id, p.id)).rejects.toMatchObject({ code: 'PARTNER_AT_CAPACITY' });
      expect(await prisma.deliveryJob.count({ where: { orderId: order.id } })).toBe(0);
      expect(await prisma.shipment.count({ where: { orderId: order.id } })).toBe(0);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('confirmed');
    });

    it('return after failed attempts cancels the order and ends the job and shipment', async () => {
      const order = await seedOrder();
      const p = await seedPartner();
      const { jobId } = await jobs.assign('a1', order.id, p.id);
      await jobs.accept(p.id, jobId);
      await jobs.pickUp(p.id, jobId);
      await jobs.start(p.id, jobId);
      await jobs.fail(p.id, jobId, { reasonCode: 'refused' });
      await jobs.markReturned('admin-1', jobId, 'customer refused the parcel');
      expect((await prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('returned');
      expect((await prisma.shipment.findFirstOrThrow({ where: { orderId: order.id } })).status).toBe('rto');
      expect(cancelledOrders).toEqual([order.id]);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('cancelled');
    });

    it('takes over a shipment made earlier by the mock courier', async () => {
      const order = await seedOrder({ status: 'packed' });
      const old = await prisma.shipment.create({ data: { orderId: order.id, provider: 'mock', awb: 'MOCKAWB1', courier: 'Mock', status: 'packed' } });
      const p = await seedPartner();
      await jobs.assign('a1', order.id, p.id);
      const ships = await prisma.shipment.findMany({ where: { orderId: order.id } });
      expect(ships).toHaveLength(1);
      expect(ships[0]).toMatchObject({ id: old.id, provider: 'inhouse', courier: 'Belzo Delivery' });
    });
  });

  describe('reading', () => {
    it('shows a partner only their own jobs, and a preview before Accept', async () => {
      const order = await seedOrder();
      const p1 = await seedPartner('9876504444');
      const p2 = await seedPartner('9876505555');
      const { jobId } = await jobs.assign('a1', order.id, p1.id);
      const mine = await query.partnerList(p1.id, { scope: 'active', page: 1, pageSize: 20 });
      expect(mine.items).toHaveLength(1);
      expect(mine.items[0]?.kind).toBe('preview');
      expect(JSON.stringify(mine.items[0])).not.toMatch(/Asha Rao|MG Road|9876543210/);
      expect((await query.partnerList(p2.id, { scope: 'active', page: 1, pageSize: 20 })).items).toHaveLength(0);
      await expect(query.partnerGet(p2.id, jobId)).rejects.toBeInstanceOf(DeliveryError);
      await jobs.accept(p1.id, jobId);
      const detail = await query.partnerGet(p1.id, jobId);
      expect(detail).toMatchObject({ kind: 'detail', destName: 'Asha Rao' });
    });

    it('admin list, search and dashboard work with the real queries', async () => {
      const order = await seedOrder();
      const p = await seedPartner();
      const { jobId } = await jobs.assign('a1', order.id, p.id);
      await jobs.reject(p.id, jobId, 'bike broke down');
      const list = await query.adminList({ page: 1, pageSize: 10, q: 'asha' });
      expect(list.items.map((i) => i.id)).toEqual([jobId]);
      const dash = await query.dashboard();
      expect(dash.counts.new).toBe(1);
      expect(dash.attention.map((a) => a.attention)).toEqual(['rejected']);
      const detail = await query.adminGet(jobId);
      expect(detail.events.map((e) => e.event)).toEqual(['assigned', 'rejected']);
    });
  });
});
