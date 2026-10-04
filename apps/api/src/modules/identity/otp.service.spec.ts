import { BadRequestException } from '@nestjs/common';
import fc from 'fast-check';
import { OtpService } from './otp.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { EmailProvider } from '../../integrations/notifications/channels';
import type { SmsProvider } from '../../integrations/sms/sms.provider';

interface OtpRow {
  id: string;
  email: string | null;
  phone: string | null;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
}

/** In-memory fake of the OtpRequest table. */
function fakePrisma(rows: OtpRow[]): PrismaService {
  let seq = 0;
  return {
    otpRequest: {
      create: async ({ data }: { data: Partial<OtpRow> }) => {
        const row: OtpRow = {
          id: `otp${seq++}`,
          attempts: 0,
          maxAttempts: 5,
          consumedAt: null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          codeHash: data.codeHash!,
          expiresAt: data.expiresAt!,
        };
        rows.push(row);
        return row;
      },
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        rows.find((r) => r.id === id) ?? null,
      update: async ({
        where: { id },
        data,
      }: {
        where: { id: string };
        data: { attempts?: { increment: number }; consumedAt?: Date };
      }) => {
        const row = rows.find((r) => r.id === id)!;
        if (data.attempts?.increment) row.attempts += data.attempts.increment;
        if (data.consumedAt) row.consumedAt = data.consumedAt;
        return row;
      },
    },
  } as unknown as PrismaService;
}

const noopEmail: EmailProvider = { send: async () => ({ messageId: 'x' }) };
const noopSms: SmsProvider = { send: async () => ({ messageId: 'x' }) };

describe('OtpService', () => {
  it('BR-1: wrong codes increment attempts monotonically and lock after maxAttempts', async () => {
    const rows: OtpRow[] = [];
    const svc = new OtpService(fakePrisma(rows), noopEmail, noopSms);
    const { requestId } = await svc.request({ email: 'user@belzo.local' });

    let lastAttempts = 0;
    for (let i = 0; i < 5; i++) {
      await expect(svc.verify(requestId, '000000')).rejects.toBeInstanceOf(BadRequestException);
      const row = rows.find((r) => r.id === requestId)!;
      expect(row.attempts).toBeGreaterThanOrEqual(lastAttempts); // monotonic
      lastAttempts = row.attempts;
    }
    // 6th attempt is blocked by the maxAttempts guard.
    await expect(svc.verify(requestId, '000000')).rejects.toThrow('Too many attempts');
    const row = rows.find((r) => r.id === requestId)!;
    expect(row.attempts).toBeLessThanOrEqual(row.maxAttempts + 1);
  });

  it('PBT-03: attempts never exceed maxAttempts + 1 for arbitrary wrong-guess counts', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 20 }), async (guesses) => {
        const rows: OtpRow[] = [];
        const svc = new OtpService(fakePrisma(rows), noopEmail, noopSms);
        const { requestId } = await svc.request({ email: 'user@belzo.local' });
        for (let i = 0; i < guesses; i++) {
          await svc.verify(requestId, '111111').catch(() => undefined);
        }
        const row = rows.find((r) => r.id === requestId)!;
        expect(row.attempts).toBeLessThanOrEqual(row.maxAttempts + 1);
      }),
      { numRuns: 15 },
    );
  });

  it('rejects an expired code', async () => {
    const rows: OtpRow[] = [];
    const svc = new OtpService(fakePrisma(rows), noopEmail, noopSms);
    const { requestId } = await svc.request({ email: 'user@belzo.local' });
    rows.find((r) => r.id === requestId)!.expiresAt = new Date(Date.now() - 1000);
    await expect(svc.verify(requestId, '123456')).rejects.toThrow('expired');
  });
});

