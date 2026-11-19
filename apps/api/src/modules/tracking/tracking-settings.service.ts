import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { sanitizeTracking, TRACKING_SETTING_KEY, type TrackingConfig } from '@belzo/shared';
import { decryptSecret, encryptSecret } from '../../integrations/payment/secret-box';
import { SettingsService } from '../admin/settings.service';
import {
  SERVER_TRACKING_KEY,
  serverTrackingReady,
  type ServerTrackingReady,
  type StoredServerTracking,
} from './server-tracking';
import { buildMetaRequest, META_GRAPH_VERSION, type ServerEvent } from './tracking-payloads';

/** Same server secret the other encrypted admin settings (SMS key, payment keys) use. */
function serverSecret(): string {
  return process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_REFRESH_SECRET || '';
}

/** Last 4 characters only: enough to recognise a secret, useless to anyone else. */
export function hint(secret: string): string {
  return secret ? `••••••••${secret.slice(-4)}` : '';
}

/** The secrets in plain text, for the forwarder only. Never returned by any endpoint. */
export interface RuntimeTracking {
  config: TrackingConfig;
  ga4ApiSecret?: string;
  metaAccessToken?: string;
  metaTestEventCode?: string;
}

export interface ServerTrackingStatus {
  ga4: { measurementId: string; secretConfigured: boolean; secretHint: string };
  meta: { pixelId: string; tokenConfigured: boolean; tokenHint: string; testEventCode: string };
  ready: ServerTrackingReady;
  updatedAt: string | null;
  /** A stored secret could not be decrypted (the server's encryption secret changed): save it again. */
  unreadable: boolean;
}

export interface ServerTrackingInput {
  /** Empty string removes the stored value. Omitted keeps it. */
  ga4ApiSecret?: string;
  metaAccessToken?: string;
  metaTestEventCode?: string;
}

export interface TrackingCheck {
  ok: boolean;
  message: string;
}

const GA4_SECRET = /^[A-Za-z0-9_-]{8,100}$/;
const META_TOKEN = /^[A-Za-z0-9_|-]{40,600}$/;
const META_TEST_CODE = /^[A-Za-z0-9]{3,30}$/;

/**
 * Admin-editable server-side tracking secrets (Google Analytics 4 API secret, Meta Conversions API token) used
 * to forward the mobile app's events. Secrets are encrypted (AES-256-GCM) before they are written to the
 * settings table, are never returned by any endpoint, and the Meta token is checked with Meta before it is saved.
 */
@Injectable()
export class TrackingSettingsService {
  constructor(private readonly settings: SettingsService) {}

  async publicConfig(): Promise<TrackingConfig> {
    return sanitizeTracking(await this.settings.get<unknown>(TRACKING_SETTING_KEY));
  }

  private async stored(): Promise<StoredServerTracking> {
    const raw = await this.settings.get<StoredServerTracking>(SERVER_TRACKING_KEY).catch(() => null);
    return raw && typeof raw === 'object' ? raw : {};
  }

  /** Decrypted values for the forwarder. A value that cannot be decrypted is treated as not set. */
  async runtime(): Promise<RuntimeTracking> {
    const [config, s] = await Promise.all([this.publicConfig(), this.stored()]);
    const open = (enc?: string) => (enc ? (decryptSecret(enc, serverSecret()) ?? undefined) : undefined);
    return {
      config,
      ga4ApiSecret: open(s.ga4ApiSecretEnc),
      metaAccessToken: open(s.metaAccessTokenEnc),
      metaTestEventCode: s.metaTestEventCode || undefined,
    };
  }

  async status(): Promise<ServerTrackingStatus> {
    const [config, s] = await Promise.all([this.publicConfig(), this.stored()]);
    const ga4 = s.ga4ApiSecretEnc ? decryptSecret(s.ga4ApiSecretEnc, serverSecret()) : null;
    const meta = s.metaAccessTokenEnc ? decryptSecret(s.metaAccessTokenEnc, serverSecret()) : null;
    return {
      ga4: { measurementId: config.ga4Id, secretConfigured: Boolean(ga4), secretHint: hint(ga4 ?? '') },
      meta: {
        pixelId: config.metaPixelId,
        tokenConfigured: Boolean(meta),
        tokenHint: hint(meta ?? ''),
        testEventCode: s.metaTestEventCode ?? '',
      },
      ready: serverTrackingReady(config, {
        ga4ApiSecretEnc: ga4 ? s.ga4ApiSecretEnc : undefined,
        metaAccessTokenEnc: meta ? s.metaAccessTokenEnc : undefined,
      }),
      updatedAt: s.updatedAt ?? null,
      unreadable: Boolean((s.ga4ApiSecretEnc && !ga4) || (s.metaAccessTokenEnc && !meta)),
    };
  }

  /** Validate, verify the Meta token with Meta, encrypt and store. Omitted fields keep their current value. */
  async save(actorId: string, input: ServerTrackingInput): Promise<void> {
    const ga4 = input.ga4ApiSecret?.trim();
    const token = input.metaAccessToken?.trim();
    const code = input.metaTestEventCode?.trim();
    if (ga4 === undefined && token === undefined && code === undefined) throw new BadRequestException('Nothing to save');
    if (ga4 && !GA4_SECRET.test(ga4)) {
      throw new BadRequestException('That does not look like a GA4 API secret (GA4 → Admin → Data streams → Measurement Protocol API secrets)');
    }
    if (token && !META_TOKEN.test(token)) {
      throw new BadRequestException('That does not look like a Meta access token (Events Manager → Settings → Conversions API → Generate access token)');
    }
    if (code && !META_TEST_CODE.test(code)) {
      throw new BadRequestException('The test event code looks like TEST12345 (Events Manager → Test events)');
    }
    if (!serverSecret()) throw new BadRequestException('The server cannot encrypt secrets right now');

    // Never replace a working token with one Meta rejects (needs the Pixel ID to be saved first).
    if (token) {
      const { metaPixelId } = await this.publicConfig();
      if (metaPixelId) {
        const check = await this.checkMetaToken(metaPixelId, token);
        if (!check.ok) throw new BadRequestException(check.message);
      }
    }

    const cur = await this.stored();
    const value: StoredServerTracking = {
      ga4ApiSecretEnc: ga4 === undefined ? cur.ga4ApiSecretEnc : ga4 === '' ? undefined : encryptSecret(ga4, serverSecret()),
      metaAccessTokenEnc: token === undefined ? cur.metaAccessTokenEnc : token === '' ? undefined : encryptSecret(token, serverSecret()),
      metaTestEventCode: code === undefined ? cur.metaTestEventCode : code === '' ? undefined : code,
      updatedAt: new Date().toISOString(),
    };
    // Audit logging records this value, which only ever holds ciphertext for the secrets.
    await this.settings.set(actorId, SERVER_TRACKING_KEY, value);
  }

  /** Forget every server-side secret. */
  async reset(actorId: string): Promise<void> {
    await this.settings.set(actorId, SERVER_TRACKING_KEY, {});
  }

  /** Free check: can this token read this pixel? Sends no event. */
  async checkMetaToken(pixelId: string, token: string): Promise<TrackingCheck> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pixelId)}?fields=id,name`, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string; error?: { message?: string } };
      if (res.ok && body.id) return { ok: true, message: `Meta accepted the token for pixel "${body.name ?? body.id}".` };
      return { ok: false, message: `Meta rejected this token for pixel ${pixelId}: ${body.error?.message ?? `HTTP ${res.status}`}` };
    } catch {
      return { ok: false, message: 'Could not reach Meta to check the token. Please try again.' };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Send one test event to Meta. Only allowed while a Test event code is saved, so a test can never land in the
   * live reports. Shows Meta's own answer, so a wrong pixel or token is explained.
   */
  async testMeta(): Promise<TrackingCheck> {
    const rt = await this.runtime();
    if (!rt.config.metaPixelId) return { ok: false, message: 'Save the Facebook Pixel ID first (Tracking card above).' };
    if (!rt.metaAccessToken) return { ok: false, message: 'Save the Meta access token first.' };
    if (!rt.metaTestEventCode) {
      return { ok: false, message: 'Save a Test event code first (Events Manager → Test events), so the test does not count as a real event.' };
    }
    const ev: ServerEvent = {
      name: 'view_item',
      clientId: 'belzo-admin-test',
      eventId: randomUUID(),
      timeSec: Math.floor(Date.now() / 1000),
      items: [{ id: 'test', name: 'Test event from Belzo admin', price: 10_000, quantity: 1 }],
      valuePaise: 10_000,
    };
    const { url, body } = buildMetaRequest(rt.config.metaPixelId, rt.metaAccessToken, ev, rt.metaTestEventCode);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const out = (await res.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string } };
      if (res.ok && (out.events_received ?? 0) > 0) {
        return { ok: true, message: 'Meta received the test event. Open Events Manager → Test events to see it (a ViewContent event).' };
      }
      return { ok: false, message: `Meta did not accept the test event: ${out.error?.message ?? `HTTP ${res.status}`}` };
    } catch {
      return { ok: false, message: 'Could not reach Meta. Please try again.' };
    } finally {
      clearTimeout(timer);
    }
  }
}
