import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { SmsGatewayCreds } from './sms-credentials';
import type { SmsMessage, SmsProvider, SmsPurpose } from './sms.provider';

export type Fast2SmsConfig = SmsGatewayCreds;

interface Fast2SmsResponse {
  return?: boolean;
  request_id?: string;
  status_code?: number;
  message?: string | string[];
}

const ENDPOINT = 'https://www.fast2sms.com/dev/bulkV2';
const SMART_OTP_ENDPOINT = 'https://www.fast2sms.com/dev/otp/send';
const TIMEOUT_MS = 10_000;
/** Matches OtpService' own 5 minute validity; sent so Fast2SMS' template text agrees. */
const SMART_OTP_EXPIRY_MIN = 5;

/**
 * Fast2SMS refused or failed the send. The client only gets the generic message; `reason` is
 * Fast2SMS' own explanation and is shown to super admins by the "Send test SMS" button.
 */
export class SmsGatewayError extends ServiceUnavailableException {
  constructor(readonly reason: string) {
    super('Could not send the OTP SMS right now. Please try again in a minute.');
  }
}

/**
 * The Smart OTP template for an OTP's purpose: its own template when one is set, else the general
 * OTP ID. A "login" code has no template of its own and uses the registration one.
 */
export function smartOtpIdFor(cfg: Fast2SmsConfig, purpose: SmsPurpose | undefined): string {
  const own = purpose === 'reset' ? cfg.otpIdReset : purpose === 'delivery' ? cfg.otpIdDelivery : cfg.otpIdRegister;
  return own || cfg.otpId;
}

/** Canonical 10-digit Indian mobile, or null when the input is not one. */
export function toIndianMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/**
 * Fast2SMS adapter (https://docs.fast2sms.com). One POST to /dev/bulkV2 with the API key in the
 * `authorization` header:
 *  - route "otp": body { route, variables_values: <code>, numbers }  -> "Your OTP: <code>"
 *  - route "dlt": body { route, sender_id, message: <approved message id>, variables_values, numbers }
 *  - route "smart" (Smart OTP): POST /dev/otp/send { otp_id: <linked template>, mobile, otp: <our code> }.
 *    We still generate and verify the code ourselves; Fast2SMS only delivers it.
 *
 * Only one-time-code messages are sent; other messages (order updates) are skipped with a log line
 * because Fast2SMS' OTP route cannot carry free text and they need their own DLT template.
 *
 * It uses fetch directly instead of ResilientHttpService: that client's circuit breaker opens on a
 * single 4xx, so one customer typing a bad number would block OTPs for everyone for 15 s.
 * The OTP code and API key are never logged.
 */
@Injectable()
export class Fast2SmsProvider implements SmsProvider {
  private readonly logger = new Logger('Fast2SmsProvider');

  /** A fixed config, or a getter so the key/route can change at runtime (admin panel). */
  constructor(private readonly source: Fast2SmsConfig | (() => Fast2SmsConfig)) {}

  private get config(): Fast2SmsConfig {
    return typeof this.source === 'function' ? this.source() : this.source;
  }

  async send(message: SmsMessage): Promise<{ messageId: string }> {
    if (!message.otp) {
      this.logger.warn(`Skipping non-OTP SMS (template ${message.templateId ?? '-'}): not supported by the Fast2SMS OTP route`);
      return { messageId: 'skipped-non-otp' };
    }
    const cfg = this.config;
    const unavailable = () =>
      new ServiceUnavailableException('Could not send the OTP SMS right now. Please try again in a minute.');
    if (!cfg.apiKey) {
      this.logger.error('Fast2SMS API key is not configured');
      throw unavailable();
    }
    if (cfg.route === 'dlt' && (!cfg.senderId || !cfg.dltMessageId)) {
      this.logger.error('Fast2SMS DLT route needs a sender id and an approved message id');
      throw unavailable();
    }
    const numbers = toIndianMobile(message.to);
    if (!numbers) throw new BadRequestException('Enter a valid 10-digit Indian mobile number.');

    const otpId = smartOtpIdFor(cfg, message.purpose);
    if (cfg.route === 'smart' && !otpId) {
      this.logger.error(`Fast2SMS Smart OTP route has no OTP ID for "${message.purpose ?? 'general'}" codes`);
      throw unavailable();
    }

    const smart = cfg.route === 'smart';
    const body = smart
      ? {
          otp_id: otpId,
          mobile: numbers,
          otp: message.otp,
          otp_length: message.otp.length,
          otp_expiry: SMART_OTP_EXPIRY_MIN,
        }
      : cfg.route === 'dlt'
        ? {
            route: 'dlt',
            sender_id: cfg.senderId,
            message: cfg.dltMessageId,
            variables_values: message.otp,
            numbers,
          }
        : { route: 'otp', variables_values: message.otp, numbers };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(smart ? SMART_OTP_ENDPOINT : ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: cfg.apiKey,
          'content-type': 'application/json',
          accept: '*/*',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let json: Fast2SmsResponse = {};
      try {
        json = text ? (JSON.parse(text) as Fast2SmsResponse) : {};
      } catch {
        /* non-JSON error page */
      }
      if (!res.ok || json.return !== true) {
        const reason = Array.isArray(json.message) ? json.message.join('; ') : (json.message ?? text.slice(0, 120));
        this.logger.error(`Fast2SMS rejected the OTP SMS (http ${res.status}, code ${json.status_code ?? '-'}): ${reason}`);
        throw new SmsGatewayError(String(reason));
      }
      return { messageId: json.request_id ?? 'fast2sms' };
    } catch (err) {
      if (err instanceof ServiceUnavailableException || err instanceof BadRequestException) throw err;
      this.logger.error(`Fast2SMS request failed: ${(err as Error).name}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Could not send the OTP SMS right now. Please try again in a minute.');
    } finally {
      clearTimeout(timer);
    }
  }
}
