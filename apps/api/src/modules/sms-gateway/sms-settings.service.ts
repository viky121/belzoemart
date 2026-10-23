import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { SmsGatewayError, toIndianMobile } from '../../integrations/sms/fast2sms.provider';
import { SmsCredentials, type SmsGatewayCreds, type SmsRoute } from '../../integrations/sms/sms-credentials';
import { SMS_PROVIDER, type SmsProvider } from '../../integrations/sms/sms.provider';
import { decryptSecret, encryptSecret } from '../../integrations/payment/secret-box';
import { SettingsService } from '../admin/settings.service';

/** Settings key holding the admin-entered SMS settings (the API key is stored encrypted). */
export const SMS_CREDENTIALS_KEY = 'sms.fast2sms.credentials';

/** How often a running server re-reads the stored settings (covers other instances). */
const REFRESH_MS = 60_000;

interface StoredSms {
  apiKeyEnc?: string;
  route?: SmsRoute;
  senderId?: string;
  dltMessageId?: string;
  otpId?: string;
  otpIdRegister?: string;
  otpIdReset?: string;
  otpIdDelivery?: string;
  updatedAt?: string;
}

export interface SmsSettingsInput {
  apiKey?: string;
  route?: SmsRoute;
  senderId?: string;
  dltMessageId?: string;
  otpId?: string;
  otpIdRegister?: string;
  otpIdReset?: string;
  otpIdDelivery?: string;
}

export interface SmsCheck {
  ok: boolean;
  message: string;
  wallet?: { balance: number; smsCount: number };
}

export interface SmsGatewayStatus {
  mode: 'live' | 'mock';
  route: SmsRoute;
  /** Safe-to-show hint (last 4 characters only), never the key. */
  keyHint: string;
  keyConfigured: boolean;
  senderId: string;
  dltMessageId: string;
  otpId: string;
  otpIdRegister: string;
  otpIdReset: string;
  otpIdDelivery: string;
  source: {
    apiKey: 'admin' | 'env';
    route: 'admin' | 'env';
    senderId: 'admin' | 'env';
    dltMessageId: 'admin' | 'env';
    otpId: 'admin' | 'env';
    otpIdRegister: 'admin' | 'env';
    otpIdReset: 'admin' | 'env';
    otpIdDelivery: 'admin' | 'env';
  };
  credentialsUpdatedAt: string | null;
  overrideUnreadable: boolean;
}

function serverSecret(): string {
  return process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_REFRESH_SECRET || '';
}

/** Last 4 characters only: enough to recognise a key, useless to anyone else. */
export function maskKey(key: string): string {
  return key ? `••••••••${key.slice(-4)}` : '';
}

/**
 * Admin-editable Fast2SMS settings. The API key entered in the admin panel is encrypted
 * (AES-256-GCM) before it is written to the settings table, is never returned by any endpoint
 * and is checked against Fast2SMS (a free wallet lookup) before it replaces the working key.
 * The server environment stays as the fallback, so clearing the override (or a value that
 * cannot be decrypted) returns to the environment's key instead of breaking OTP login.
 */
@Injectable()
export class SmsSettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('SmsSettingsService');
  private timer?: ReturnType<typeof setInterval>;
  private unreadable = false;
  private updatedAt: string | null = null;

  constructor(
    private readonly settings: SettingsService,
    private readonly creds: SmsCredentials,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.load();
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.load(), REFRESH_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Read the stored override into the live credentials. Never throws. */
  async load(): Promise<void> {
    try {
      const stored = await this.settings.get<StoredSms>(SMS_CREDENTIALS_KEY);
      const s = stored ?? {};
      const override: Partial<SmsGatewayCreds> = {};
      let unreadable = false;
      if (s.apiKeyEnc) {
        const plain = decryptSecret(s.apiKeyEnc, serverSecret());
        if (plain === null) unreadable = true;
        else override.apiKey = plain;
      }
      if (s.route) override.route = s.route;
      if (s.senderId) override.senderId = s.senderId;
      if (s.dltMessageId) override.dltMessageId = s.dltMessageId;
      if (s.otpId) override.otpId = s.otpId;
      if (s.otpIdRegister) override.otpIdRegister = s.otpIdRegister;
      if (s.otpIdReset) override.otpIdReset = s.otpIdReset;
      if (s.otpIdDelivery) override.otpIdDelivery = s.otpIdDelivery;
      this.unreadable = unreadable;
      this.updatedAt = s.updatedAt ?? null;
      this.creds.setOverride(override);
    } catch (e) {
      this.logger.warn(`Could not load stored SMS settings; using the server environment: ${String(e)}`);
    }
  }

  status(): SmsGatewayStatus {
    const c = this.creds.get();
    const o = this.creds.overridden();
    const src = (b: boolean) => (b ? ('admin' as const) : ('env' as const));
    return {
      mode: (process.env.SMS_PROVIDER ?? 'mock') === 'live' ? 'live' : 'mock',
      route: c.route,
      keyHint: maskKey(c.apiKey),
      keyConfigured: Boolean(c.apiKey),
      senderId: c.senderId,
      dltMessageId: c.dltMessageId,
      otpId: c.otpId,
      otpIdRegister: c.otpIdRegister,
      otpIdReset: c.otpIdReset,
      otpIdDelivery: c.otpIdDelivery,
      source: {
        apiKey: src(o.apiKey),
        route: src(o.route),
        senderId: src(o.senderId),
        dltMessageId: src(o.dltMessageId),
        otpId: src(o.otpId),
        otpIdRegister: src(o.otpIdRegister),
        otpIdReset: src(o.otpIdReset),
        otpIdDelivery: src(o.otpIdDelivery),
      },
      credentialsUpdatedAt: this.updatedAt,
      overrideUnreadable: this.unreadable,
    };
  }

  /** Validate, verify the key with Fast2SMS, encrypt and store. Omitted fields keep their current value. */
  async save(actorId: string, input: SmsSettingsInput): Promise<void> {
    const apiKey = input.apiKey?.trim();
    const senderId = input.senderId?.trim();
    const dltMessageId = input.dltMessageId?.trim();
    const otpId = input.otpId?.trim();
    const otpIdRegister = input.otpIdRegister?.trim();
    const otpIdReset = input.otpIdReset?.trim();
    const otpIdDelivery = input.otpIdDelivery?.trim();
    const route = input.route;
    if (!apiKey && !senderId && !dltMessageId && !otpId && !otpIdRegister && !otpIdReset && !otpIdDelivery && !route) {
      throw new BadRequestException('Nothing to save');
    }

    if (apiKey !== undefined && !/^[A-Za-z0-9]{40,100}$/.test(apiKey)) {
      throw new BadRequestException('That does not look like a Fast2SMS API key (copy it from Dev API in Fast2SMS)');
    }
    if (senderId !== undefined && !/^[A-Za-z]{3,6}$/.test(senderId)) {
      throw new BadRequestException('Sender ID is 3 to 6 letters (your DLT-approved header)');
    }
    if (dltMessageId !== undefined && !/^\d{3,20}$/.test(dltMessageId)) {
      throw new BadRequestException('Message ID is the number shown for your approved template in Fast2SMS DLT Manager');
    }
    for (const [label, id] of [['OTP ID', otpId], ['Registration OTP ID', otpIdRegister], ['Password reset OTP ID', otpIdReset], ['Delivery OTP ID', otpIdDelivery]] as const) {
      if (id !== undefined && !/^[A-Za-z0-9_-]{3,40}$/.test(id)) {
        throw new BadRequestException(`${label} is the id shown for your template under Smart OTP in Fast2SMS`);
      }
    }
    if (!serverSecret()) throw new BadRequestException('The server cannot encrypt secrets right now');

    const current = this.creds.get();
    const next = {
      route: route ?? current.route,
      senderId: senderId ?? current.senderId,
      dltMessageId: dltMessageId ?? current.dltMessageId,
      otpId: otpId ?? current.otpId,
      otpIdRegister: otpIdRegister ?? current.otpIdRegister,
      otpIdReset: otpIdReset ?? current.otpIdReset,
    };
    if (next.route === 'smart' && !next.otpId && !(next.otpIdRegister && next.otpIdReset)) {
      throw new BadRequestException(
        'The Smart OTP route needs an OTP ID: either one general template, or both a registration and a password reset template',
      );
    }
    if (next.route === 'dlt' && (!next.senderId || !next.dltMessageId)) {
      throw new BadRequestException('The DLT route needs both a Sender ID and a Message ID');
    }

    // Never replace a working key with one Fast2SMS rejects.
    if (apiKey !== undefined) {
      const check = await this.checkKey(apiKey);
      if (!check.ok) throw new BadRequestException(check.message);
    }

    const stored = (await this.settings.get<StoredSms>(SMS_CREDENTIALS_KEY).catch(() => null)) ?? ({} as StoredSms);
    const value: StoredSms = {
      apiKeyEnc: apiKey !== undefined ? encryptSecret(apiKey, serverSecret()) : stored.apiKeyEnc,
      route: route ?? stored.route,
      senderId: senderId ?? stored.senderId,
      dltMessageId: dltMessageId ?? stored.dltMessageId,
      otpId: otpId ?? stored.otpId,
      otpIdRegister: otpIdRegister ?? stored.otpIdRegister,
      otpIdReset: otpIdReset ?? stored.otpIdReset,
      otpIdDelivery: otpIdDelivery ?? stored.otpIdDelivery,
      updatedAt: new Date().toISOString(),
    };
    // Audit logging records this value, which only ever holds ciphertext for the key.
    await this.settings.set(actorId, SMS_CREDENTIALS_KEY, value);
    await this.load();
  }

  /** Forget the admin-entered settings and go back to the server environment's. */
  async reset(actorId: string): Promise<void> {
    await this.settings.set(actorId, SMS_CREDENTIALS_KEY, {});
    await this.load();
  }

  /** Check an API key with Fast2SMS' free wallet lookup (sends no SMS, costs nothing). */
  async checkKey(apiKey: string): Promise<SmsCheck> {
    if (!apiKey) return { ok: false, message: 'The API key is missing' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch('https://www.fast2sms.com/dev/wallet', {
        headers: { authorization: apiKey },
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as { return?: boolean; wallet?: string; sms_count?: number };
      if (res.ok && json.return === true) {
        const balance = Number(json.wallet);
        const wallet = { balance: Number.isFinite(balance) ? balance : 0, smsCount: Number(json.sms_count) || 0 };
        return {
          ok: true,
          wallet,
          message: `Fast2SMS accepted this key. Wallet: ₹${wallet.balance.toFixed(2)} (about ${wallet.smsCount} SMS)`,
        };
      }
      if (res.status === 401 || res.status === 412 || json.return === false) {
        return { ok: false, message: 'Fast2SMS rejected this API key. Check it in Dev API and try again.' };
      }
      return { ok: false, message: `Fast2SMS answered ${res.status}; try again in a moment` };
    } catch {
      return { ok: false, message: 'Could not reach Fast2SMS to check the key. Try again.' };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Check the key in use right now. */
  testCurrent(): Promise<SmsCheck> {
    return this.checkKey(this.creds.get().apiKey);
  }

  /** Send one real OTP-style SMS to a number the admin gives (costs one SMS). */
  async sendTest(phone: string): Promise<{ ok: boolean; message: string }> {
    if ((process.env.SMS_PROVIDER ?? 'mock') !== 'live') {
      return { ok: false, message: 'SMS is in test (mock) mode on the server, so no real SMS is sent.' };
    }
    const to = toIndianMobile(phone);
    if (!to) throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    try {
      await this.sms.send({ to, body: `Test code ${code}`, otp: code, templateId: 'BELZO_OTP_TEST', purpose: 'register' });
      return { ok: true, message: `Test SMS sent to ${to.slice(0, 2)}••••••${to.slice(-2)}. It should arrive in a few seconds.` };
    } catch (e) {
      if (e instanceof SmsGatewayError) return { ok: false, message: `Fast2SMS did not send it: ${e.reason}` };
      const msg = e instanceof Error ? e.message : 'Could not send the test SMS';
      return { ok: false, message: `${msg} Check the API logs for the reason from Fast2SMS.` };
    }
  }
}
