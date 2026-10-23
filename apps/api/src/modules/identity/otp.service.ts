import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EMAIL_PROVIDER, type EmailProvider } from '../../integrations/notifications/channels';
import { SMS_PROVIDER, type SmsProvider, type SmsPurpose } from '../../integrations/sms/sms.provider';

export interface OtpChallenge {
  requestId: string;
  expiresAt: string;
  /** Present only when the delivery channel is not a live provider (demo/dev),
   *  so the code can be shown in the UI instead of being silently logged. */
  devCode?: string;
}

export interface OtpTarget {
  phone?: string;
  email?: string;
}

/**
 * OTP request/verify (BR-1). A 6-digit code is generated, hashed and stored
 * with a short expiry. Delivery is by SMS (phone) or email. When the relevant
 * provider is not "live" (e.g. the mock SMS adapter), the code is returned as
 * `devCode` so a demo build stays usable until a real gateway is configured.
 */
@Injectable()
export class OtpService {
  private readonly ttlMs = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /** Normalise an Indian mobile to canonical 10 digits (strip +91 / spaces). */
  static normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(-10);
  }

  /**
   * Every live SMS costs money, so cap them per number on top of the per-IP throttle:
   * one every 30 s and at most 5 per hour. Only applied when a live SMS gateway is configured.
   */
  private async assertSmsAllowance(phone: string): Promise<void> {
    const now = Date.now();
    const recent = await this.prisma.otpRequest.findMany({
      where: { phone, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const last = recent[0];
    if (last && now - last.createdAt.getTime() < 30_000) {
      const wait = Math.ceil((30_000 - (now - last.createdAt.getTime())) / 1000);
      throw new HttpException(`Please wait ${wait} seconds before requesting another code.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (recent.length >= 5) {
      throw new HttpException('Too many codes requested for this number. Try again in an hour.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async request(target: OtpTarget, purpose?: SmsPurpose): Promise<OtpChallenge> {
    const phone = target.phone ? OtpService.normalizePhone(target.phone) : undefined;
    const email = target.email?.trim().toLowerCase();
    if (!phone && !email) throw new BadRequestException('Provide a phone number or email');

    if (phone && (process.env.SMS_PROVIDER ?? 'mock') === 'live') await this.assertSmsAllowance(phone);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const record = await this.prisma.otpRequest.create({
      data: { email: email ?? null, phone: phone ?? null, codeHash: this.hash(code), expiresAt },
    });

    let live = false;
    try {
      if (phone) {
        live = (process.env.SMS_PROVIDER ?? 'mock') === 'live';
        await this.sms.send({
          to: phone,
          body: `Your Belzo eMart verification code is ${code}. Valid for 5 minutes.`,
          templateId: 'BELZO_OTP',
          otp: code,
          purpose,
        });
      } else if (email) {
        live = (process.env.EMAIL_PROVIDER ?? 'mock') === 'live';
        await this.email.send({
          to: email,
          subject: 'Your Belzo eMart verification code',
          html: `<p>Your Belzo eMart verification code is <strong>${code}</strong>.</p><p>It is valid for 5 minutes.</p>`,
        });
      }
    } catch (err) {
      // Nothing reached the customer: drop the unusable request so it does not count toward the SMS cooldown.
      await this.prisma.otpRequest.delete({ where: { id: record.id } }).catch(() => undefined);
      throw err;
    }

    return {
      requestId: record.id,
      expiresAt: expiresAt.toISOString(),
      ...(live ? {} : { devCode: code }),
    };
  }

  /**
   * Verify a code for a request. Returns the identifier (email/phone) on
   * success. Throws on any failure (expired, consumed, too many attempts,
   * wrong code). Every wrong attempt increments the counter (BR-1).
   */
  async verify(requestId: string, code: string): Promise<{ email: string | null; phone: string | null }> {
    const record = await this.prisma.otpRequest.findUnique({ where: { id: requestId } });
    if (!record) throw new BadRequestException('Invalid or expired code');
    if (record.consumedAt) throw new BadRequestException('Code already used');
    if (record.expiresAt.getTime() < Date.now()) throw new BadRequestException('Code expired');
    if (record.attempts >= record.maxAttempts) {
      throw new BadRequestException('Too many attempts');
    }

    if (record.codeHash !== this.hash(code)) {
      await this.prisma.otpRequest.update({
        where: { id: requestId },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Incorrect code');
    }

    await this.prisma.otpRequest.update({
      where: { id: requestId },
      data: { consumedAt: new Date() },
    });
    return { email: record.email, phone: record.phone };
  }
}
