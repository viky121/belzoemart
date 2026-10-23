import { Injectable } from '@nestjs/common';

/** "otp" = Fast2SMS OTP route; "dlt" = DLT route (sender id + message id); "smart" = Smart OTP template (OTP ID). */
export type SmsRoute = 'otp' | 'dlt' | 'smart';

export interface SmsGatewayCreds {
  apiKey: string;
  route: SmsRoute;
  senderId: string;
  dltMessageId: string;
  /** Smart OTP route: the OTP ID of the template linked in Fast2SMS > Smart OTP. */
  otpId: string;
  /** Smart OTP: one template per purpose. Each falls back to `otpId` when empty. */
  otpIdRegister: string;
  otpIdReset: string;
  otpIdDelivery: string;
}

/** Fields an admin can override. Each one falls back to the server environment on its own. */
export type SmsCredsOverride = Partial<SmsGatewayCreds>;

/**
 * The Fast2SMS settings the SMS adapter uses right now.
 *
 * They start as the server environment (FAST2SMS_*). A super admin can override them from the
 * admin panel; the sms-gateway module loads that override here (it keeps the encrypted copy
 * in the database). A small in-memory holder so the adapter can read the current values on
 * every send without touching the database.
 */
@Injectable()
export class SmsCredentials {
  private override: SmsCredsOverride = {};

  /** Replace the admin override (an empty object clears it). */
  setOverride(o: SmsCredsOverride): void {
    this.override = {
      ...(o.apiKey ? { apiKey: o.apiKey } : {}),
      ...(o.route ? { route: o.route } : {}),
      ...(o.senderId ? { senderId: o.senderId } : {}),
      ...(o.dltMessageId ? { dltMessageId: o.dltMessageId } : {}),
      ...(o.otpId ? { otpId: o.otpId } : {}),
      ...(o.otpIdRegister ? { otpIdRegister: o.otpIdRegister } : {}),
      ...(o.otpIdReset ? { otpIdReset: o.otpIdReset } : {}),
      ...(o.otpIdDelivery ? { otpIdDelivery: o.otpIdDelivery } : {}),
    };
  }

  get(): SmsGatewayCreds {
    const r = process.env.FAST2SMS_ROUTE;
    const envRoute: SmsRoute = r === 'dlt' || r === 'smart' ? r : 'otp';
    return {
      apiKey: this.override.apiKey ?? process.env.FAST2SMS_API_KEY ?? '',
      route: this.override.route ?? envRoute,
      senderId: this.override.senderId ?? process.env.FAST2SMS_SENDER_ID ?? '',
      dltMessageId: this.override.dltMessageId ?? process.env.FAST2SMS_DLT_MESSAGE_ID ?? '',
      otpId: this.override.otpId ?? process.env.FAST2SMS_OTP_ID ?? '',
      otpIdRegister: this.override.otpIdRegister ?? process.env.FAST2SMS_OTP_ID_REGISTER ?? '',
      otpIdReset: this.override.otpIdReset ?? process.env.FAST2SMS_OTP_ID_RESET ?? '',
      otpIdDelivery: this.override.otpIdDelivery ?? process.env.FAST2SMS_OTP_ID_DELIVERY ?? '',
    };
  }

  /** Which values currently come from the admin override. */
  overridden(): Record<keyof SmsGatewayCreds, boolean> {
    return {
      apiKey: Boolean(this.override.apiKey),
      route: Boolean(this.override.route),
      senderId: Boolean(this.override.senderId),
      dltMessageId: Boolean(this.override.dltMessageId),
      otpId: Boolean(this.override.otpId),
      otpIdRegister: Boolean(this.override.otpIdRegister),
      otpIdReset: Boolean(this.override.otpIdReset),
      otpIdDelivery: Boolean(this.override.otpIdDelivery),
    };
  }
}
