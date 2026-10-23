import { Logger } from '@nestjs/common';
import { DEFAULT_DELIVERY_SETTINGS } from '@belzo/shared';
import { DeliveryOtpService, type IssuedOtp } from './delivery-otp.service';
import { DeliveryError } from '../delivery-errors';
import { SECURITY_EVENTS, type DeliverySecurityEvents } from '../security-events';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { SmsMessage, SmsProvider } from '../../../integrations/sms/sms.provider';
import type { AuditLogService } from '../../admin/audit-log.service';
import type { DeliverySettingsService } from '../settings/delivery-settings.service';
import type { JobRepository } from '../jobs/job.repository';

process.env.DELIVERY_OTP_PEPPER = 'pepper-for-tests-0123456789abcdefghij';

const JOB = 'job-1';
const PARTNER = 'partner-1';

interface Otp {
  id: string;
  jobId: string;
  assignmentId: string | null;
  attemptNo: number;
  phone: string;
  codeHash: string;
  status: string;
  sendStatus: string;
  wrongGuesses: number;
  sendCount: number;
  expiresAt: Date;
  sentAt: Date | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

function build(jobOver: Record<string, any> = {}) {
  const clock = { now: new Date('2026-10-23T10:00:00Z') };
  const job: Record<string, any> = {
    id: JOB,
    partnerId: PARTNER,
    status: 'arrived',
    attemptsUsed: 0,
    otpPhone: '9876543210',
    currentAssignmentId: 'asg-1',
    otpLockedUntil: null,
    ...jobOver,
  };
  const otps: Otp[] = [];
  const events: any[] = [];
  let seq = 0;

  const matchOtp = (o: Otp, where: Record<string, any> = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'lt' in v) return (o as any)[k] < v.lt;
      return (o as any)[k] === v;
    });

  const tx: any = {
    deliveryOtp: {
      findFirst: async ({ where, orderBy }: any) => {
        const hit = otps.filter((o) => matchOtp(o, where));
        if (orderBy?.createdAt === 'desc') hit.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.sendCount - a.sendCount);
        return hit[0] ?? null;
      },
      create: async ({ data }: any) => {
        clock.now = new Date(clock.now.getTime() + 1); // keep createdAt strictly increasing
        const row: Otp = { id: `otp-${++seq}`, status: 'active', sendStatus: 'pending', wrongGuesses: 0, sentAt: null, verifiedAt: null, createdAt: new Date(clock.now), ...data };
        otps.push(row);
        return row;
      },
      update: async ({ where, data }: any) => Object.assign(otps.find((o) => o.id === where.id) as Otp, data),
      updateMany: async ({ where, data }: any) => {
        const hit = otps.filter((o) => matchOtp(o, where));
        hit.forEach((o) => Object.assign(o, data));
        return { count: hit.length };
      },
      deleteMany: async ({ where }: any) => {
        const before = otps.length;
        for (let i = otps.length - 1; i >= 0; i -= 1) if (matchOtp(otps[i] as Otp, where)) otps.splice(i, 1);
        return { count: before - otps.length };
      },
    },
    deliveryJob: { update: async ({ data }: any) => Object.assign(job, data) },
    deliveryEvent: { create: async ({ data }: any) => void events.push(data) },
  };
  const prisma = tx as unknown as PrismaService;
  const repo = {
    transaction: async (fn: any) => fn(tx),
    lockJob: async (_tx: unknown, id: string) => (id === JOB ? { ...job } : null),
    now: async () => clock.now,
  } as unknown as JobRepository;
  const sent: SmsMessage[] = [];
  const smsState = { failing: false };
  const sms: SmsProvider = {
    send: async (m) => {
      if (smsState.failing) throw new Error('gateway down');
      sent.push(m);
      return { messageId: 'm1' };
    },
  };
  const secEvents: string[] = [];
  const security = { record: async (e: string) => void secEvents.push(e) } as unknown as DeliverySecurityEvents;
  const audits: any[][] = [];
  const audit = { record: async (...a: any[]) => void audits.push(a) } as unknown as AuditLogService;
  const settings = { get: async () => DEFAULT_DELIVERY_SETTINGS } as unknown as DeliverySettingsService;
  const service = new DeliveryOtpService(prisma, repo, settings, sms, security, audit);

  /** Issue a code the way the transition engine will, and return the clear code like the SMS would carry it. */
  const issue = async (sendCount = 1): Promise<IssuedOtp> => service.issueInTx(tx, job as any, clock.now, DEFAULT_DELIVERY_SETTINGS, sendCount);
  const advance = (seconds: number) => void (clock.now = new Date(clock.now.getTime() + seconds * 1000));
  return { service, job, otps, events, sent, smsState, secEvents, audits, issue, advance, clock };
}

const code = (c: IssuedOtp) => c.code;
async function expectError(p: Promise<unknown>, status: number, errCode: string): Promise<DeliveryError> {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(DeliveryError);
  expect((e as DeliveryError).getStatus()).toBe(status);
  expect((e as DeliveryError).code).toBe(errCode);
  return e as DeliveryError;
}

describe('DeliveryOtpService.issueInTx and deliver', () => {
  beforeEach(() => void jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('stores only a hash, valid for 4 hours, for attempt number attemptsUsed + 1', async () => {
    const t = build({ attemptsUsed: 1 });
    const issued = await t.issue();
    const row = t.otps[0] as Otp;
    expect(row.attemptNo).toBe(2);
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(issued.code);
    expect(row.expiresAt.getTime() - t.clock.now.getTime()).toBeLessThanOrEqual(240 * 60_000);
    expect(row.status).toBe('active');
  });

  it('retires the previous active code', async () => {
    const t = build();
    await t.issue();
    await t.issue(2);
    expect(t.otps.map((o) => o.status)).toEqual(['superseded', 'active']);
  });

  it('sends the code through the SMS port as a delivery OTP and records it', async () => {
    const t = build();
    const issued = await t.issue();
    expect(await t.service.deliver(issued)).toBe(true);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ to: '9876543210', otp: issued.code, purpose: 'delivery' });
    expect(t.otps[0]).toMatchObject({ sendStatus: 'sent' });
    expect(t.events.at(-1)).toMatchObject({ event: 'otp_sent', actorKind: 'system', meta: { to: 'XXXXXX3210' } });
    expect(JSON.stringify(t.events)).not.toContain(issued.code);
  });

  it('survives a failed SMS: no throw, marked failed, event recorded', async () => {
    const t = build();
    t.smsState.failing = true;
    const issued = await t.issue();
    await expect(t.service.deliver(issued)).resolves.toBe(false);
    expect(t.otps[0]).toMatchObject({ sendStatus: 'failed' });
    expect(t.events.at(-1)).toMatchObject({ event: 'otp_send_failed' });
  });
});

describe('DeliveryOtpService.verify', () => {
  it('verifies the right code', async () => {
    const t = build();
    const issued = await t.issue();
    await expect(t.service.verify(PARTNER, JOB, code(issued))).resolves.toEqual({ verified: true });
    expect(t.otps[0]).toMatchObject({ status: 'verified' });
    expect(t.otps[0]?.verifiedAt).toBeInstanceOf(Date);
    expect(t.events.at(-1)).toMatchObject({ event: 'otp_verified', actorKind: 'partner', actorId: PARTNER });
  });

  it('counts wrong guesses and tells how many are left', async () => {
    const t = build();
    await t.issue();
    const e = await expectError(t.service.verify(PARTNER, JOB, '000000'), 422, 'OTP_INVALID');
    expect((e.getResponse() as any).attemptsLeft).toBe(4);
    expect(t.otps[0]?.wrongGuesses).toBe(1);
  });

  it('locks the job after five wrong guesses and then refuses even the right code', async () => {
    const t = build();
    const issued = await t.issue();
    const wrong = issued.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i += 1) await expectError(t.service.verify(PARTNER, JOB, wrong), 422, 'OTP_INVALID');
    await expectError(t.service.verify(PARTNER, JOB, wrong), 423, 'OTP_LOCKED');
    expect(t.otps[0]?.status).toBe('locked');
    expect(t.job.otpLockedUntil).toBeInstanceOf(Date);
    expect(t.events.map((e) => e.event)).toContain('otp_locked');
    expect(t.secEvents).toContain(SECURITY_EVENTS.OTP_LOCKED);
    await expectError(t.service.verify(PARTNER, JOB, issued.code), 423, 'OTP_LOCKED');
  });

  it('after the lock time the old code is dead and the partner must resend', async () => {
    const t = build();
    const issued = await t.issue();
    for (let i = 0; i < 5; i += 1) await t.service.verify(PARTNER, JOB, '000000').catch(() => undefined);
    t.advance(16 * 60);
    await expectError(t.service.verify(PARTNER, JOB, issued.code), 410, 'OTP_EXPIRED');
  });

  it('refuses an expired code and marks it expired', async () => {
    const t = build();
    const issued = await t.issue();
    t.advance(241 * 60);
    await expectError(t.service.verify(PARTNER, JOB, issued.code), 410, 'OTP_EXPIRED');
    expect(t.otps[0]?.status).toBe('expired');
  });

  it('answers 404 for another partner and raises a security event', async () => {
    const t = build();
    const issued = await t.issue();
    await expectError(t.service.verify('someone-else', JOB, issued.code), 404, 'NOT_FOUND');
    await expectError(t.service.verify(PARTNER, 'no-such-job', issued.code), 404, 'NOT_FOUND');
    expect(t.secEvents.filter((e) => e === SECURITY_EVENTS.ACCESS_DENIED)).toHaveLength(2);
    expect(t.otps[0]?.status).toBe('active');
  });

  it('only works once the partner has arrived', async () => {
    const t = build({ status: 'out_for_delivery' });
    const issued = await t.issue();
    await expectError(t.service.verify(PARTNER, JOB, issued.code), 409, 'INVALID_TRANSITION');
  });

  it('a code from an earlier send no longer works after a resend', async () => {
    const t = build({ status: 'out_for_delivery' });
    const first = await t.issue();
    t.advance(61);
    await t.service.resend(PARTNER, JOB);
    t.job.status = 'arrived';
    const e = await t.service.verify(PARTNER, JOB, first.code).catch((x: unknown) => x);
    // The first code can only pass if the new random code happens to be identical.
    if (!(e instanceof DeliveryError)) expect(t.sent.at(-1)?.otp).toBe(first.code);
    else expect(e.code).toBe('OTP_INVALID');
  });
});

describe('DeliveryOtpService.resend', () => {
  beforeEach(() => void jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('sends a new code, retires the old one and starts the cooldown', async () => {
    const t = build({ status: 'out_for_delivery' });
    const first = await t.issue();
    await t.service.deliver(first);
    t.advance(61);
    const r = await t.service.resend(PARTNER, JOB);
    expect(t.otps.map((o) => o.status)).toEqual(['superseded', 'active']);
    expect(t.otps[1]?.sendCount).toBe(2);
    expect(t.sent).toHaveLength(2);
    expect(new Date(r.nextAllowedAt).getTime() - t.clock.now.getTime()).toBeLessThanOrEqual(60_000);
  });

  it('answers 429 with the seconds to wait when it is too soon', async () => {
    const t = build({ status: 'out_for_delivery' });
    await t.service.deliver(await t.issue());
    t.advance(20);
    const e = await expectError(t.service.resend(PARTNER, JOB), 429, 'OTP_RESEND_TOO_SOON');
    expect((e.getResponse() as any).retryAfterSeconds).toBeGreaterThan(0);
    expect(t.sent).toHaveLength(1);
  });

  it('stops after the send limit', async () => {
    const t = build({ status: 'out_for_delivery' });
    await t.service.deliver(await t.issue());
    for (let i = 0; i < 4; i += 1) {
      t.advance(61);
      await t.service.resend(PARTNER, JOB);
    }
    expect(t.sent).toHaveLength(5);
    t.advance(61);
    await expectError(t.service.resend(PARTNER, JOB), 409, 'OTP_SEND_LIMIT');
    expect(t.sent).toHaveLength(5);
  });

  it('is refused while the job is locked', async () => {
    const t = build({ status: 'arrived', otpLockedUntil: new Date('2026-10-23T10:10:00Z') });
    await expectError(t.service.resend(PARTNER, JOB), 423, 'OTP_LOCKED');
  });

  it('is refused for another partner and for a job that is not on the road', async () => {
    const t = build({ status: 'out_for_delivery' });
    await expectError(t.service.resend('someone-else', JOB), 404, 'NOT_FOUND');
    const idle = build({ status: 'accepted' });
    await expectError(idle.service.resend(PARTNER, JOB), 409, 'INVALID_TRANSITION');
  });

  it('still moves on when the SMS fails: the partner is told nothing breaks and can resend later', async () => {
    const t = build({ status: 'out_for_delivery' });
    t.smsState.failing = true;
    await expect(t.service.resend(PARTNER, JOB)).resolves.toBeDefined();
    expect(t.otps[0]).toMatchObject({ status: 'active', sendStatus: 'failed' });
  });
});

describe('DeliveryOtpService admin actions and clean-up', () => {
  it('unlock clears the lock, writes an event and audits it', async () => {
    const t = build({ otpLockedUntil: new Date('2026-10-23T10:10:00Z') });
    await t.service.adminUnlock('admin-1', JOB);
    expect(t.job.otpLockedUntil).toBeNull();
    expect(t.events.at(-1)).toMatchObject({ event: 'otp_unlocked', actorKind: 'admin', actorId: 'admin-1' });
    expect(t.audits[0]?.[1]).toBe('delivery.otp_unlock');
    expect(t.secEvents).toContain(SECURITY_EVENTS.OTP_UNLOCKED);
    await expectError(t.service.adminUnlock('admin-1', 'nope'), 404, 'NOT_FOUND');
  });

  it('changes the OTP phone and logs only masked numbers', async () => {
    const t = build();
    await t.service.adminChangeContact('admin-1', JOB, '9123456780');
    expect(t.job.otpPhone).toBe('9123456780');
    const logged = JSON.stringify([t.events, t.audits]);
    expect(logged).not.toContain('9876543210');
    expect(logged).not.toContain('9123456780');
    expect(logged).toContain('XXXXXX3210');
    expect(logged).toContain('XXXXXX6780');
  });

  it('refuses to change the phone of a finished delivery', async () => {
    const t = build({ status: 'delivered' });
    await expectError(t.service.adminChangeContact('admin-1', JOB, '9123456780'), 409, 'INVALID_TRANSITION');
  });

  it('purges: expires old active codes and deletes rows older than 30 days', async () => {
    const t = build();
    await t.issue();
    (t.otps[0] as Otp).expiresAt = new Date(t.clock.now.getTime() - 1000);
    (t.otps[0] as Otp).createdAt = new Date(t.clock.now.getTime() - 31 * 24 * 3_600_000);
    const r = await t.service.purgeExpired(t.clock.now);
    expect(r).toEqual({ expired: 1, deleted: 1 });
    expect(t.otps).toHaveLength(0);
  });

  it('reports the OTP step for the partner screen', async () => {
    const t = build({ status: 'out_for_delivery' });
    const issued = await t.issue();
    await t.service.deliver(issued);
    const tx: any = { deliveryOtp: { findFirst: async () => t.otps.at(-1) ?? null } };
    const job = { ...t.job } as any;

    const fresh = await t.service.stepView(tx, job, t.clock.now, DEFAULT_DELIVERY_SETTINGS);
    expect(fresh).toMatchObject({ sendStatus: 'sent', sendsLeft: 4, lockedUntil: null, verified: false });
    expect(fresh.resendAvailableAt).not.toBeNull();

    t.advance(61);
    expect((await t.service.stepView(tx, job, t.clock.now, DEFAULT_DELIVERY_SETTINGS)).resendAvailableAt).toBeNull();

    (t.otps[0] as Otp).status = 'verified';
    expect((await t.service.stepView(tx, job, t.clock.now, DEFAULT_DELIVERY_SETTINGS)).verified).toBe(true);

    const locked = { ...job, otpLockedUntil: new Date(t.clock.now.getTime() + 60_000) };
    expect((await t.service.stepView(tx, locked, t.clock.now, DEFAULT_DELIVERY_SETTINGS)).lockedUntil).not.toBeNull();
  });

  it('tells when the last verification is fresh enough to deliver', async () => {
    const t = build();
    const verifiedAt = new Date(t.clock.now.getTime() - 10 * 60_000);
    expect(t.service.isFresh(verifiedAt, t.clock.now, DEFAULT_DELIVERY_SETTINGS)).toBe(true);
    expect(t.service.isFresh(new Date(t.clock.now.getTime() - 45 * 60_000), t.clock.now, DEFAULT_DELIVERY_SETTINGS)).toBe(false);
    expect(t.service.isFresh(null, t.clock.now, DEFAULT_DELIVERY_SETTINGS)).toBe(false);
  });
});
