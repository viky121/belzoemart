import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { OtpService } from './otp.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { EmailProvider } from '../../integrations/notifications/channels';
import type { SmsMessage, SmsProvider } from '../../integrations/sms/sms.provider';

interface Row {
  id: string;
  phone: string | null;
  createdAt: Date;
}

function fakePrisma(rows: Row[]): PrismaService {
  let seq = 0;
  return {
    otpRequest: {
      create: async ({ data }: { data: { phone?: string | null } }) => {
        const row = { id: `o${seq++}`, phone: data.phone ?? null, createdAt: new Date() };
        rows.push(row);
        return row;
      },
      delete: async ({ where: { id } }: { where: { id: string } }) => {
        rows.splice(rows.findIndex((r) => r.id === id), 1);
      },
      findMany: async ({ where }: { where: { phone: string; createdAt: { gte: Date } } }) =>
        rows
          .filter((r) => r.phone === where.phone && r.createdAt >= where.createdAt.gte)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    },
  } as unknown as PrismaService;
}

const email: EmailProvider = { send: async () => ({ messageId: 'x' }) };

describe('OtpService — SMS delivery', () => {
  const prev = process.env.SMS_PROVIDER;
  afterEach(() => {
    process.env.SMS_PROVIDER = prev;
  });

  it('hands the raw code to the SMS provider and hides devCode when live', async () => {
    process.env.SMS_PROVIDER = 'live';
    const sent: SmsMessage[] = [];
    const sms: SmsProvider = { send: async (m) => (sent.push(m), { messageId: 'x' }) };
    const res = await new OtpService(fakePrisma([]), email, sms).request({ phone: '+91 98765 43210' });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('9876543210');
    expect(sent[0].otp).toMatch(/^\d{6}$/);
    expect(res.devCode).toBeUndefined();
  });

  it('tells the SMS provider what the code is for, so it can pick the matching template', async () => {
    process.env.SMS_PROVIDER = 'live';
    const sent: SmsMessage[] = [];
    const sms: SmsProvider = { send: async (m) => (sent.push(m), { messageId: 'x' }) };
    const svc = new OtpService(fakePrisma([]), email, sms);
    await svc.request({ phone: '9876543210' }, 'reset');
    await svc.request({ phone: '9876543211' }, 'register');
    expect(sent.map((m) => m.purpose)).toEqual(['reset', 'register']);
  });

  it('still returns devCode with the mock provider', async () => {
    process.env.SMS_PROVIDER = 'mock';
    const sms: SmsProvider = { send: async () => ({ messageId: 'x' }) };
    const res = await new OtpService(fakePrisma([]), email, sms).request({ phone: '9876543210' });
    expect(res.devCode).toMatch(/^\d{6}$/);
  });

  it('drops the request when the gateway fails, so the customer can retry at once', async () => {
    process.env.SMS_PROVIDER = 'live';
    const rows: Row[] = [];
    const failing: SmsProvider = {
      send: async () => {
        throw new ServiceUnavailableException('down');
      },
    };
    const svc = new OtpService(fakePrisma(rows), email, failing);
    await expect(svc.request({ phone: '9876543210' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(rows).toHaveLength(0);
  });

  it('enforces a 30 s cooldown and 5 per hour per number (live only)', async () => {
    process.env.SMS_PROVIDER = 'live';
    const rows: Row[] = [];
    const sms: SmsProvider = { send: async () => ({ messageId: 'x' }) };
    const svc = new OtpService(fakePrisma(rows), email, sms);
    await svc.request({ phone: '9876543210' });
    await expect(svc.request({ phone: '9876543210' })).rejects.toMatchObject({ status: 429 });
    await expect(svc.request({ phone: '9876543210' })).rejects.toBeInstanceOf(HttpException);
    // five requests older than 30 s trip the hourly cap
    rows.length = 0;
    for (let i = 0; i < 5; i++) rows.push({ id: `old${i}`, phone: '9123456780', createdAt: new Date(Date.now() - 120_000) });
    await expect(svc.request({ phone: '9123456780' })).rejects.toMatchObject({ status: 429 });
    // a different number is unaffected
    await expect(svc.request({ phone: '9000000001' })).resolves.toBeDefined();
  });
});
