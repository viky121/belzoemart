import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DeliveryJob } from '@prisma/client';
import { maskMobile, type DeliverySettings } from '@belzo/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SMS_PROVIDER, type SmsProvider } from '../../../integrations/sms/sms.provider';
import { AuditLogService } from '../../admin/audit-log.service';
import { DeliveryError } from '../delivery-errors';
import { writeEvent } from '../jobs/event-writer';
import { JobRepository, type Db, type Tx } from '../jobs/job.repository';
import { DeliverySecurityEvents, SECURITY_EVENTS } from '../security-events';
import { DeliverySettingsService } from '../settings/delivery-settings.service';
import { checkOtp, decideResend, generateOtpCode, hashOtp, isVerificationFresh } from './otp-rules';

/** A code that was just made. Only this object ever holds the clear code, and only until it is sent. */
export interface IssuedOtp {
  otpId: string;
  jobId: string;
  phone: string;
  code: string;
}

export interface OtpStepView {
  sendStatus: 'pending' | 'sent' | 'failed' | null;
  sendsLeft: number;
  resendAvailableAt: string | null;
  lockedUntil: string | null;
  verified: boolean;
}

type JobForOtp = Pick<DeliveryJob, 'id' | 'otpPhone' | 'currentAssignmentId' | 'attemptsUsed'>;

/**
 * Delivery OTP (component C5, BR-D30 to BR-D39, SP4). The code is never stored, returned or
 * logged: only its peppered HMAC is kept. Sending happens after the database transaction has
 * committed, so a slow SMS provider never holds a row lock (RP2).
 */
@Injectable()
export class DeliveryOtpService {
  private readonly logger = new Logger('DeliveryOtp');

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: JobRepository,
    private readonly settings: DeliverySettingsService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly security: DeliverySecurityEvents,
    private readonly audit: AuditLogService,
  ) {}

  private pepper(): string {
    return process.env.DELIVERY_OTP_PEPPER ?? '';
  }

  /** Inside a transaction: retire the active code and make a new one. The caller sends it after commit. */
  async issueInTx(tx: Tx, job: JobForOtp, now: Date, settings: DeliverySettings, sendCount = 1): Promise<IssuedOtp> {
    const attemptNo = job.attemptsUsed + 1;
    await tx.deliveryOtp.updateMany({ where: { jobId: job.id, status: 'active' }, data: { status: 'superseded' } });
    const code = generateOtpCode();
    const row = await tx.deliveryOtp.create({
      data: {
        jobId: job.id,
        assignmentId: job.currentAssignmentId,
        attemptNo,
        phone: job.otpPhone,
        codeHash: hashOtp(this.pepper(), job.id, attemptNo, code),
        expiresAt: new Date(now.getTime() + settings.otpValidMinutes * 60_000),
        sendCount,
      },
    });
    return { otpId: row.id, jobId: job.id, phone: job.otpPhone, code };
  }

  /** After commit: send the SMS and record the result. Never throws; a failed send leaves the job as it is (BR-D33). */
  async deliver(issued: IssuedOtp): Promise<boolean> {
    let sent = false;
    try {
      await this.sms.send({
        to: issued.phone,
        body: `Your Belzo delivery OTP is ${issued.code}. Share it only with the delivery partner when you receive your order.`,
        otp: issued.code,
        purpose: 'delivery',
      });
      sent = true;
    } catch (e) {
      this.logger.warn({ jobId: issued.jobId, error: e instanceof Error ? e.name : 'unknown' }, 'delivery OTP SMS failed');
    }
    try {
      // The cooldown is measured against the database clock, like every other delivery deadline.
      const sentAt = await this.repo.now(this.prisma);
      await this.prisma.deliveryOtp.update({
        where: { id: issued.otpId },
        data: sent ? { sendStatus: 'sent', sentAt } : { sendStatus: 'failed' },
      });
      await writeEvent(this.prisma, {
        jobId: issued.jobId,
        event: sent ? 'otp_sent' : 'otp_send_failed',
        actorKind: 'system',
        meta: { to: maskMobile(issued.phone) },
      });
    } catch (e) {
      this.logger.error({ jobId: issued.jobId, error: e instanceof Error ? e.name : 'unknown' }, 'could not record OTP send result');
    }
    return sent;
  }

  /** Partner types the code the customer gave (BR-D35 to BR-D37). */
  async verify(partnerId: string, jobId: string, code: string): Promise<{ verified: true }> {
    const settings = await this.settings.get();
    const outcome = await this.repo.transaction(async (tx) => {
      const job = await this.repo.lockJob(tx, jobId);
      if (!job || job.partnerId !== partnerId) return { type: 'not_found' as const };
      if (job.status !== 'arrived') return { type: 'bad_state' as const, status: job.status };
      const now = await this.repo.now(tx);
      const otp = await tx.deliveryOtp.findFirst({ where: { jobId, status: 'active' } });
      const decision = checkOtp({
        otp: otp && { codeHash: otp.codeHash, wrongGuesses: otp.wrongGuesses, expiresAt: otp.expiresAt, attemptNo: otp.attemptNo },
        jobId,
        lockedUntil: job.otpLockedUntil,
        now,
        settings,
        pepper: this.pepper(),
        code,
      });

      if (decision.kind === 'verified' && otp) {
        await tx.deliveryOtp.update({ where: { id: otp.id }, data: { status: 'verified', verifiedAt: now } });
        await writeEvent(tx, { jobId, event: 'otp_verified', actorKind: 'partner', actorId: partnerId, attemptNo: otp.attemptNo });
      } else if (decision.kind === 'expired' && otp) {
        await tx.deliveryOtp.update({ where: { id: otp.id }, data: { status: 'expired' } });
      } else if (decision.kind === 'wrong' && otp) {
        await tx.deliveryOtp.update({
          where: { id: otp.id },
          data: { wrongGuesses: decision.wrongGuesses, ...(decision.lock ? { status: 'locked' } : {}) },
        });
        if (decision.lock) {
          await tx.deliveryJob.update({
            where: { id: jobId },
            data: { otpLockedUntil: new Date(now.getTime() + settings.otpLockoutMinutes * 60_000) },
          });
          await writeEvent(tx, { jobId, event: 'otp_locked', actorKind: 'system', attemptNo: otp.attemptNo });
        }
      }
      return { type: 'decided' as const, decision, lockoutMinutes: settings.otpLockoutMinutes };
    });

    if (outcome.type === 'not_found') {
      await this.security.record(SECURITY_EVENTS.ACCESS_DENIED, { partnerId, jobId, action: 'otp.verify' });
      throw new DeliveryError(404, 'NOT_FOUND', 'Delivery not found');
    }
    if (outcome.type === 'bad_state') {
      throw new DeliveryError(409, 'INVALID_TRANSITION', 'The OTP can only be checked after you have arrived', { status: outcome.status });
    }
    const d = outcome.decision;
    switch (d.kind) {
      case 'verified':
        return { verified: true };
      case 'job_locked':
        throw new DeliveryError(423, 'OTP_LOCKED', 'Too many wrong codes. Please wait or ask the office to unlock.', { retryAfterSeconds: d.retryAfterSeconds });
      case 'expired':
        throw new DeliveryError(410, 'OTP_EXPIRED', 'This code has expired. Send a new code to the customer.');
      case 'wrong':
        if (d.lock) {
          await this.security.record(SECURITY_EVENTS.OTP_LOCKED, { jobId, partnerId });
          throw new DeliveryError(423, 'OTP_LOCKED', 'Too many wrong codes. Please wait or ask the office to unlock.', {
            retryAfterSeconds: outcome.lockoutMinutes * 60,
          });
        }
        throw new DeliveryError(422, 'OTP_INVALID', 'That code is not correct.', { attemptsLeft: d.attemptsLeft });
    }
  }

  /** Make and send a new code (BR-D34). */
  async resend(partnerId: string, jobId: string): Promise<{ nextAllowedAt: string }> {
    const settings = await this.settings.get();
    const outcome = await this.repo.transaction(async (tx) => {
      const job = await this.repo.lockJob(tx, jobId);
      if (!job || job.partnerId !== partnerId) return { type: 'not_found' as const };
      if (job.status !== 'out_for_delivery' && job.status !== 'arrived') return { type: 'bad_state' as const, status: job.status };
      const now = await this.repo.now(tx);
      const last = await tx.deliveryOtp.findFirst({
        where: { jobId, attemptNo: job.attemptsUsed + 1 },
        orderBy: { createdAt: 'desc' },
      });
      const decision = decideResend({
        now,
        lockedUntil: job.otpLockedUntil,
        lastSentAt: last ? (last.sentAt ?? last.createdAt) : null,
        sendCount: last?.sendCount ?? 0,
        settings,
      });
      if (!decision.ok) return { type: 'refused' as const, decision };
      const issued = await this.issueInTx(tx, job, now, settings, (last?.sendCount ?? 0) + 1);
      return { type: 'issued' as const, issued, nextAllowedAt: new Date(now.getTime() + settings.otpResendSeconds * 1000) };
    });

    if (outcome.type === 'not_found') {
      await this.security.record(SECURITY_EVENTS.ACCESS_DENIED, { partnerId, jobId, action: 'otp.resend' });
      throw new DeliveryError(404, 'NOT_FOUND', 'Delivery not found');
    }
    if (outcome.type === 'bad_state') {
      throw new DeliveryError(409, 'INVALID_TRANSITION', 'A code can only be sent while you are on the way', { status: outcome.status });
    }
    if (outcome.type === 'refused') {
      const d = outcome.decision;
      if (d.reason === 'locked') throw new DeliveryError(423, 'OTP_LOCKED', 'Codes are locked for now. Please wait or ask the office to unlock.', { retryAfterSeconds: d.retryAfterSeconds });
      if (d.reason === 'cooldown') throw new DeliveryError(429, 'OTP_RESEND_TOO_SOON', 'Please wait a little before sending another code.', { retryAfterSeconds: d.retryAfterSeconds });
      throw new DeliveryError(409, 'OTP_SEND_LIMIT', 'No more codes can be sent for this attempt. Please contact the office.');
    }
    await this.deliver(outcome.issued);
    return { nextAllowedAt: outcome.nextAllowedAt.toISOString() };
  }

  /** The time the current attempt's code was verified, if it was (used by the delivered rule, BR-D38). */
  async latestVerifiedAt(db: Db, job: Pick<DeliveryJob, 'id' | 'attemptsUsed'>): Promise<Date | null> {
    const row = await db.deliveryOtp.findFirst({
      where: { jobId: job.id, attemptNo: job.attemptsUsed + 1, status: 'verified' },
      orderBy: { verifiedAt: 'desc' },
      select: { verifiedAt: true },
    });
    return row?.verifiedAt ?? null;
  }

  /** What the partner screen needs to show for the OTP step. */
  async stepView(db: Db, job: DeliveryJob, now: Date, settings: DeliverySettings): Promise<OtpStepView> {
    const last = await db.deliveryOtp.findFirst({ where: { jobId: job.id, attemptNo: job.attemptsUsed + 1 }, orderBy: { createdAt: 'desc' } });
    const lockedUntil = job.otpLockedUntil && job.otpLockedUntil.getTime() > now.getTime() ? job.otpLockedUntil : null;
    const allowedAt = last ? new Date((last.sentAt ?? last.createdAt).getTime() + settings.otpResendSeconds * 1000) : null;
    return {
      sendStatus: last?.sendStatus ?? null,
      sendsLeft: Math.max(0, settings.otpMaxSends - (last?.sendCount ?? 0)),
      resendAvailableAt: allowedAt && allowedAt.getTime() > now.getTime() ? allowedAt.toISOString() : null,
      lockedUntil: lockedUntil?.toISOString() ?? null,
      verified: last?.status === 'verified',
    };
  }

  /** True when the verified code is still fresh enough to deliver (BR-D38). */
  isFresh(verifiedAt: Date | null, now: Date, settings: DeliverySettings): boolean {
    return isVerificationFresh(verifiedAt, now, settings);
  }

  // ----- admin actions (BR-D35, BR-D30) -----

  async adminUnlock(adminId: string, jobId: string): Promise<void> {
    await this.repo.transaction(async (tx) => {
      const job = await this.repo.lockJob(tx, jobId);
      if (!job) throw new DeliveryError(404, 'NOT_FOUND', 'Delivery not found');
      await tx.deliveryJob.update({ where: { id: jobId }, data: { otpLockedUntil: null } });
      await writeEvent(tx, { jobId, event: 'otp_unlocked', actorKind: 'admin', actorId: adminId });
    });
    await this.audit.record(adminId, 'delivery.otp_unlock', jobId);
    await this.security.record(SECURITY_EVENTS.OTP_UNLOCKED, { jobId, adminId });
  }

  /** Correct the number the OTP goes to, for this job only (BR-D30). Audited with masked numbers. */
  async adminChangeContact(adminId: string, jobId: string, phone: string): Promise<void> {
    const before = await this.repo.transaction(async (tx) => {
      const job = await this.repo.lockJob(tx, jobId);
      if (!job) throw new DeliveryError(404, 'NOT_FOUND', 'Delivery not found');
      if (['delivered', 'returned', 'cancelled'].includes(job.status)) {
        throw new DeliveryError(409, 'INVALID_TRANSITION', 'This delivery has ended');
      }
      await tx.deliveryJob.update({ where: { id: jobId }, data: { otpPhone: phone } });
      await writeEvent(tx, {
        jobId,
        event: 'contact_changed',
        actorKind: 'admin',
        actorId: adminId,
        meta: { from: maskMobile(job.otpPhone), to: maskMobile(phone) },
      });
      return job.otpPhone;
    });
    await this.audit.record(adminId, 'delivery.contact_change', jobId, { phone: maskMobile(before) }, { phone: maskMobile(phone) });
    await this.security.record(SECURITY_EVENTS.ADMIN_OVERRIDE, { jobId, adminId, action: 'contact_change' });
  }

  /** Worker: mark old active codes expired and delete rows older than 30 days (BR-D39). */
  async purgeExpired(now: Date): Promise<{ expired: number; deleted: number }> {
    const expired = await this.prisma.deliveryOtp.updateMany({
      where: { status: 'active', expiresAt: { lt: now } },
      data: { status: 'expired' },
    });
    const deleted = await this.prisma.deliveryOtp.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - 30 * 24 * 3_600_000) } },
    });
    return { expired: expired.count, deleted: deleted.count };
  }
}
