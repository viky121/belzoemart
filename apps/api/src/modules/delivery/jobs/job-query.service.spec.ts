import { DEFAULT_DELIVERY_SETTINGS, type PartnerSuggestion } from '@belzo/shared';
import { createFakeDb } from '../testing/fake-db';
import { DeliveryError } from '../delivery-errors';
import { DeliveryOtpService } from '../otp/delivery-otp.service';
import { SECURITY_EVENTS, type DeliverySecurityEvents } from '../security-events';
import type { DeliverySettingsService } from '../settings/delivery-settings.service';
import type { AuditLogService } from '../../admin/audit-log.service';
import type { PartnerService } from '../partners/partner.service';
import type { SmsProvider } from '../../../integrations/sms/sms.provider';
import { JobQueryService } from './job-query.service';
import { JobRepository } from './job.repository';

const NOW = new Date('2026-10-23T10:00:00Z');

function jobRow(over: Record<string, any>) {
  return {
    code: 'DLV-AAAAAAA2',
    orderId: 'o1',
    status: 'accepted',
    partnerId: 'p1',
    attemptsUsed: 0,
    maxAttempts: 3,
    paymentMode: 'cod',
    codAmount: 1000,
    itemCount: 2,
    destName: 'Asha Rao',
    destPhone: '9876543210',
    destLine1: '12 MG Road',
    destLine2: null,
    destCity: 'Pune',
    destState: 'MH',
    destPincode: '411001',
    otpPhone: '9123456780',
    trackingToken: 'secret-token',
 attention: null,
    createdAt: new Date(NOW.getTime() - 3_600_000),
    updatedAt: NOW,
    ...over,
  };
}

function build() {
  const db = createFakeDb(NOW);
  const { t, prisma } = db;
  t.deliveryPartner.rows.push({ id: 'p1', name: 'Ravi', isActive: true }, { id: 'p2', name: 'Sunil', isActive: false });
  t.orderItem.rows.push({ id: 'i1', orderId: 'o1', title: 'Rice 5kg', quantity: 2 }, { id: 'i2', orderId: 'o2', title: 'Tea', quantity: 1 });
  const repo = new JobRepository(prisma);
  const settings = { get: async () => DEFAULT_DELIVERY_SETTINGS } as unknown as DeliverySettingsService;
  const sms: SmsProvider = { send: async () => ({ messageId: 'm' }) };
  const secEvents: { e: string; data: any }[] = [];
  const security = {
    record: async (e: string, data: any) => void secEvents.push({ e, data }),
    counters24h: async () => ({ failedLogins24h: 3, lockedLogins24h: 1, otpLocks24h: 2, foreignJobAttempts24h: 4 }),
  } as unknown as DeliverySecurityEvents;
  const otp = new DeliveryOtpService(prisma, repo, settings, sms, security, { record: async () => undefined } as unknown as AuditLogService);
  const suggestions: PartnerSuggestion[] = [{ partnerId: 'p1', name: 'Ravi', isOnline: true, activeJobs: 1, maxActiveJobs: 5, zoneMatch: true }];
  const partners = { suggestFor: async () => suggestions } as unknown as PartnerService;
  return { svc: new JobQueryService(prisma, repo, settings, otp, partners, security), t, secEvents, db };
}

describe('JobQueryService (partner side)', () => {
  it('lists active jobs: a preview before Accept, the detail after', async () => {
    const w = build();
    w.t.deliveryJob.rows.push(
      jobRow({ id: 'j1', status: 'assigned', acceptDeadlineAt: new Date(NOW.getTime() + 600_000) }),
      jobRow({ id: 'j2', status: 'accepted', orderId: 'o2', createdAt: new Date(NOW.getTime() - 1000) }),
      jobRow({ id: 'j3', status: 'accepted', partnerId: 'p2' }),
    );
    const r = await w.svc.partnerList('p1', { scope: 'active', page: 1, pageSize: 20 });
    expect(r.total).toBe(2);
    expect(r.items.map((i) => [i.id, i.kind])).toEqual([['j1', 'preview'], ['j2', 'detail']]);
    const preview = JSON.stringify(r.items[0]);
    expect(preview).not.toMatch(/Asha Rao|9876543210|12 MG Road|secret-token/);
    const detail = r.items[1] as any;
    expect(detail.destName).toBe('Asha Rao');
    expect(detail.items).toEqual([{ title: 'Tea', quantity: 1 }]);
  });

  it('lists history: finished jobs of the last 30 days only', async () => {
    const w = build();
    w.t.deliveryJob.rows.push(
      jobRow({ id: 'j1', status: 'delivered', endedAt: new Date(NOW.getTime() - 5 * 86_400_000), deliveredAt: NOW }),
      jobRow({ id: 'j2', status: 'cancelled', endedAt: new Date(NOW.getTime() - 40 * 86_400_000) }),
      jobRow({ id: 'j3', status: 'accepted' }),
    );
    const r = await w.svc.partnerList('p1', { scope: 'history', page: 1, pageSize: 20 });
    expect(r.items.map((i) => i.id)).toEqual(['j1']);
  });

  it('opens one of the partner\'s own jobs, with the OTP step and next actions', async () => {
    const w = build();
    w.t.deliveryJob.rows.push(jobRow({ id: 'j1', status: 'arrived' }));
    const v = (await w.svc.partnerGet('p1', 'j1')) as any;
    expect(v.kind).toBe('detail');
    expect(v.nextActions).toEqual(['verify_otp', 'fail', 'resend_otp']);
    expect(v.otp).toMatchObject({ verified: false, sendsLeft: 5 });
  });

  it('answers 404 and raises a security event for a job that is not theirs', async () => {
    const w = build();
    w.t.deliveryJob.rows.push(jobRow({ id: 'j1', partnerId: 'p2' }));
    const e = await w.svc.partnerGet('p1', 'j1').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(DeliveryError);
    expect((e as DeliveryError).getStatus()).toBe(404);
    expect(w.secEvents[0]).toMatchObject({ e: SECURITY_EVENTS.ACCESS_DENIED, data: { partnerId: 'p1', jobId: 'j1' } });
    await expect(w.svc.partnerGet('p1', 'missing')).rejects.toBeInstanceOf(DeliveryError);
  });

  it('a job the partner lost (rejected, reassigned) is not readable any more', async () => {
    const w = build();
    w.t.deliveryJob.rows.push(jobRow({ id: 'j1', status: 'new', partnerId: null }));
    await expect(w.svc.partnerGet('p1', 'j1')).rejects.toBeInstanceOf(DeliveryError);
  });
});

describe('JobQueryService (admin side)', () => {
  const seed = (w: ReturnType<typeof build>) =>
    w.t.deliveryJob.rows.push(
      jobRow({ id: 'j1', code: 'DLV-AAAAAAA2', status: 'new', partnerId: null, attention: 'rejected', createdAt: new Date(NOW.getTime() - 3000) }),
      jobRow({ id: 'j2', code: 'DLV-BBBBBBB3', status: 'accepted', partnerId: 'p1', createdAt: new Date(NOW.getTime() - 2000) }),
      jobRow({ id: 'j3', code: 'DLV-CCCCCCC4', status: 'delivered', partnerId: 'p2', destCity: 'Mumbai', createdAt: new Date(NOW.getTime() - 1000) }),
    );

  it('lists newest first with partner names and filters', async () => {
    const w = build();
    seed(w);
    const all = await w.svc.adminList({ page: 1, pageSize: 20 });
    expect(all.items.map((i) => i.id)).toEqual(['j3', 'j2', 'j1']);
    expect(all.items[0]).toMatchObject({ partnerName: 'Sunil', partnerActive: false });
    expect(all.items[2]).toMatchObject({ partnerName: null });
    expect((await w.svc.adminList({ page: 1, pageSize: 20, status: 'accepted' })).items.map((i) => i.id)).toEqual(['j2']);
    expect((await w.svc.adminList({ page: 1, pageSize: 20, partnerId: 'p2' })).items.map((i) => i.id)).toEqual(['j3']);
    expect((await w.svc.adminList({ page: 1, pageSize: 20, attention: 'rejected' })).items.map((i) => i.id)).toEqual(['j1']);
    expect((await w.svc.adminList({ page: 1, pageSize: 20, q: 'bbbb' })).items.map((i) => i.id)).toEqual(['j2']);
    expect((await w.svc.adminList({ page: 2, pageSize: 2 })).items.map((i) => i.id)).toEqual(['j1']);
  });

  it('never puts the customer\'s details in a list row', async () => {
    const w = build();
    seed(w);
    const json = JSON.stringify(await w.svc.adminList({ page: 1, pageSize: 20 }));
    expect(json).not.toMatch(/9876543210|Asha Rao|12 MG Road|secret-token|9123456780/);
  });

  it('detail shows the event log in order and masked phone numbers', async () => {
    const w = build();
    seed(w);
    w.t.deliveryEvent.rows.push(
      { id: 'e2', jobId: 'j2', event: 'accepted', fromStatus: 'assigned', toStatus: 'accepted', actorKind: 'partner', actorId: 'p1', reasonCode: null, note: null, attemptNo: null, createdAt: new Date(NOW.getTime() + 2) },
      { id: 'e1', jobId: 'j2', event: 'assigned', fromStatus: 'new', toStatus: 'assigned', actorKind: 'admin', actorId: 'a1', reasonCode: null, note: null, attemptNo: null, createdAt: new Date(NOW.getTime() + 1) },
    );
    const d = await w.svc.adminGet('j2');
    expect(d.events.map((e) => e.event)).toEqual(['assigned', 'accepted']);
    expect(d.destPhoneMasked).toBe('XXXXXX3210');
    expect(d.otpPhoneMasked).toBe('XXXXXX6780');
    expect(d.address.line1).toBe('12 MG Road');
    await expect(w.svc.adminGet('missing')).rejects.toBeInstanceOf(DeliveryError);
  });

  it('dashboard: counts, the jobs that need attention, and the security numbers', async () => {
    const w = build();
    seed(w);
    const d = await w.svc.dashboard();
    expect(d.counts).toMatchObject({ new: 1, accepted: 1, delivered: 1, assigned: 0 });
    expect(d.attention.map((a) => a.id)).toEqual(['j1']);
    expect(d.security).toEqual({ failedLogins24h: 3, lockedLogins24h: 1, otpLocks24h: 2, foreignJobAttempts24h: 4 });
  });
});

describe('JobQueryService.assignOptions', () => {
  const addOrder = (w: ReturnType<typeof build>, status: string, provider = 'razorpay') => {
    w.t.address.rows.push({ id: 'a1', city: 'Pune', pincode: '411001' });
    w.t.order.rows.push({ id: 'o1', status, addressId: 'a1', grandTotal: 5000, payments: [{ provider }] });
  };

  it('offers the suggestions for an order that can be assigned', async () => {
    const w = build();
    addOrder(w, 'confirmed', 'cod');
    const r = await w.svc.assignOptions('o1');
    expect(r.order).toMatchObject({ assignable: true, reason: null, paymentMode: 'cod', city: 'Pune', pincode: '411001', grandTotal: 5000 });
    expect(r.suggestions).toHaveLength(1);
    expect(r.activeJob).toBeNull();
  });

  it('says why a pending, delivered or already assigned order cannot be assigned', async () => {
    const pending = build();
    addOrder(pending, 'pending');
    expect((await pending.svc.assignOptions('o1')).order).toMatchObject({ assignable: false, reason: 'Confirm the order first' });

    const delivered = build();
    addOrder(delivered, 'delivered');
    expect((await delivered.svc.assignOptions('o1')).order.reason).toContain('delivered');

    const busy = build();
    addOrder(busy, 'packed');
    busy.t.deliveryJob.rows.push(jobRow({ id: 'j1', status: 'accepted' }));
    const r = await busy.svc.assignOptions('o1');
    expect(r.order).toMatchObject({ assignable: false, reason: 'This order is already with a delivery partner' });
    expect(r.activeJob).toMatchObject({ id: 'j1', status: 'accepted' });
  });

  it('a job waiting in new does not block assignment', async () => {
    const w = build();
    addOrder(w, 'packed');
    w.t.deliveryJob.rows.push(jobRow({ id: 'j1', status: 'new', partnerId: null }));
    expect((await w.svc.assignOptions('o1')).order.assignable).toBe(true);
  });

  it('answers 404 for an unknown order', async () => {
    await expect(build().svc.assignOptions('nope')).rejects.toBeInstanceOf(DeliveryError);
  });
});
