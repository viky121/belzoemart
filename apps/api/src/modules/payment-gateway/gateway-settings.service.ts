import {
  BadRequestException,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { GatewayCredentials, type GatewayCreds } from '../../integrations/payment/gateway-credentials';
import { decryptSecret, encryptSecret } from '../../integrations/payment/secret-box';
import { SettingsService } from '../admin/settings.service';

/** Settings key holding the admin-entered credentials (secrets are stored encrypted). */
export const GATEWAY_CREDENTIALS_KEY = 'payment.gateway.credentials';

/** How often a running server re-reads the stored credentials (covers other instances). */
const REFRESH_MS = 60_000;

interface StoredCreds {
  keyId?: string;
  keySecretEnc?: string;
  webhookSecretEnc?: string;
  updatedAt?: string;
}

export interface CredentialsInput {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
}

export interface KeyCheck {
  ok: boolean;
  message: string;
}

/** Secret the stored values are sealed with. It never touches the database. */
function serverSecret(): string {
  return process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_REFRESH_SECRET || '';
}

/**
 * Admin-editable Razorpay credentials. Keys entered in the admin panel are encrypted
 * (AES-256-GCM) before they are written to the settings table, are never returned by any
 * endpoint, and are checked against Razorpay before they replace the working ones. The
 * server environment stays as the fallback, so clearing the override (or a value that
 * cannot be decrypted) returns to the environment's keys instead of breaking payments.
 */
@Injectable()
export class GatewaySettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('GatewaySettingsService');
  private timer?: ReturnType<typeof setInterval>;
  /** True when a stored value exists but cannot be decrypted (e.g. the server secret changed). */
  private unreadable = false;
  private updatedAt: string | null = null;

  constructor(
    private readonly settings: SettingsService,
    private readonly creds: GatewayCredentials,
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

  get isUnreadable(): boolean {
    return this.unreadable;
  }

  get lastUpdatedAt(): string | null {
    return this.updatedAt;
  }

  /** Read the stored override into the live credentials. Never throws. */
  async load(): Promise<void> {
    try {
      const stored = await this.settings.get<StoredCreds>(GATEWAY_CREDENTIALS_KEY);
      const { creds, unreadable } = this.open(stored ?? {});
      this.unreadable = unreadable;
      this.updatedAt = stored?.updatedAt ?? null;
      this.creds.setOverride(creds);
    } catch (e) {
      this.logger.warn(`Could not load stored gateway credentials; using the server environment: ${String(e)}`);
    }
  }

  private open(stored: StoredCreds): { creds: Partial<GatewayCreds>; unreadable: boolean } {
    const out: Partial<GatewayCreds> = {};
    let unreadable = false;
    if (stored.keyId) out.keyId = stored.keyId;
    for (const [field, sealed] of [
      ['keySecret', stored.keySecretEnc],
      ['webhookSecret', stored.webhookSecretEnc],
    ] as const) {
      if (!sealed) continue;
      const plain = decryptSecret(sealed, serverSecret());
      if (plain === null) unreadable = true;
      else out[field] = plain;
    }
    // A key id without its secret (or the reverse) would pair mismatched keys: use neither.
    if (unreadable || !out.keyId !== !out.keySecret) {
      delete out.keyId;
      delete out.keySecret;
    }
    return { creds: out, unreadable };
  }

  /** Validate, verify with Razorpay, encrypt and store. Omitted fields keep their current value. */
  async save(actorId: string, input: CredentialsInput): Promise<void> {
    const keyId = input.keyId?.trim();
    const keySecret = input.keySecret?.trim();
    const webhookSecret = input.webhookSecret?.trim();
    if (!keyId && !keySecret && !webhookSecret) throw new BadRequestException('Nothing to save');

    if (keyId !== undefined && !/^rzp_(live|test)_[A-Za-z0-9]{6,}$/.test(keyId)) {
      throw new BadRequestException('Key ID must look like rzp_live_xxxxxxxx');
    }
    if (keySecret !== undefined && keySecret.length < 10) {
      throw new BadRequestException('Key secret looks too short');
    }
    if (webhookSecret !== undefined && webhookSecret.length < 8) {
      throw new BadRequestException('Webhook secret must be at least 8 characters');
    }
    if (!serverSecret()) throw new BadRequestException('The server cannot encrypt secrets right now');

    const current = this.creds.get();
    const next = {
      keyId: keyId ?? current.keyId,
      keySecret: keySecret ?? current.keySecret,
      webhookSecret: webhookSecret ?? current.webhookSecret,
    };
    if ((keyId !== undefined) !== (keySecret !== undefined)) {
      throw new BadRequestException('Enter the Key ID and the Key secret together');
    }

    // Never replace working keys with ones Razorpay rejects.
    if (keyId !== undefined && keySecret !== undefined) {
      const check = await this.verifyKeys(next.keyId, next.keySecret);
      if (!check.ok) throw new BadRequestException(check.message);
    }

    const stored =
      (await this.settings.get<StoredCreds>(GATEWAY_CREDENTIALS_KEY).catch(() => null)) ?? ({} as StoredCreds);
    const value: StoredCreds = {
      keyId: keyId ?? stored.keyId,
      keySecretEnc: keySecret !== undefined ? encryptSecret(keySecret, serverSecret()) : stored.keySecretEnc,
      webhookSecretEnc:
        webhookSecret !== undefined ? encryptSecret(webhookSecret, serverSecret()) : stored.webhookSecretEnc,
      updatedAt: new Date().toISOString(),
    };
    // Audit logging records this value, which only ever holds ciphertext.
    await this.settings.set(actorId, GATEWAY_CREDENTIALS_KEY, value);
    await this.load();
  }

  /** Forget the admin-entered credentials and go back to the server environment's. */
  async reset(actorId: string): Promise<void> {
    await this.settings.set(actorId, GATEWAY_CREDENTIALS_KEY, {});
    await this.load();
  }

  /** Check a key pair with a read-only call to Razorpay. */
  async verifyKeys(keyId: string, keySecret: string): Promise<KeyCheck> {
    if (!keyId || !keySecret) return { ok: false, message: 'Key ID or secret is missing' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch('https://api.razorpay.com/v1/orders?count=1', {
        headers: { authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` },
        signal: controller.signal,
      });
      if (res.ok) return { ok: true, message: 'Razorpay accepted these keys' };
      if (res.status === 401) return { ok: false, message: 'Razorpay rejected these keys (check the Key ID and secret)' };
      return { ok: false, message: `Razorpay answered ${res.status}; try again in a moment` };
    } catch {
      return { ok: false, message: 'Could not reach Razorpay to check the keys. Try again.' };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Check the keys in use right now. */
  testCurrent(): Promise<KeyCheck> {
    const c = this.creds.get();
    return this.verifyKeys(c.keyId, c.keySecret);
  }
}
