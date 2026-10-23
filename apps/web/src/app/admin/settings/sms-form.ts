export type SmsRoute = 'otp' | 'dlt' | 'smart';

export interface SmsForm {
  apiKey: string;
  route: SmsRoute;
  senderId: string;
  dltMessageId: string;
  /** General Smart OTP template (used for any purpose that has no template of its own). */
  otpId: string;
  /** Smart OTP template per purpose. */
  otpIdRegister: string;
  otpIdReset: string;
  otpIdDelivery: string;
}

export interface SmsPayload {
  apiKey?: string;
  route?: SmsRoute;
  senderId?: string;
  dltMessageId?: string;
  otpId?: string;
  otpIdRegister?: string;
  otpIdReset?: string;
  otpIdDelivery?: string;
}

export interface SmsCurrent {
  route: SmsRoute;
  senderId: string;
  dltMessageId: string;
  otpId: string;
  otpIdRegister?: string;
  otpIdReset?: string;
  otpIdDelivery?: string;
}

export const EMPTY_SMS_FORM: SmsForm = {
  apiKey: '',
  route: 'otp',
  senderId: '',
  dltMessageId: '',
  otpId: '',
  otpIdRegister: '',
  otpIdReset: '',
  otpIdDelivery: '',
};

/** Start the form from what is saved now (the key itself is never known to the browser). */
export function formFromStatus(s: SmsCurrent): SmsForm {
  return {
    apiKey: '',
    route: s.route,
    senderId: s.senderId,
    dltMessageId: s.dltMessageId,
    otpId: s.otpId,
    otpIdRegister: s.otpIdRegister ?? '',
    otpIdReset: s.otpIdReset ?? '',
    otpIdDelivery: s.otpIdDelivery ?? '',
  };
}

const OTP_ID = /^[A-Za-z0-9_-]{3,40}$/;

/**
 * What to send: only what changed, so a blank key field means "keep the current key".
 * Returns an error message when the form can't be saved.
 */
export function buildSmsPayload(f: SmsForm, current: SmsCurrent): { payload: SmsPayload } | { error: string } {
  const apiKey = f.apiKey.trim();
  const senderId = f.senderId.trim();
  const dltMessageId = f.dltMessageId.trim();
  const ids = {
    otpId: f.otpId.trim(),
    otpIdRegister: f.otpIdRegister.trim(),
    otpIdReset: f.otpIdReset.trim(),
    otpIdDelivery: f.otpIdDelivery.trim(),
  };
  if (apiKey && !/^[A-Za-z0-9]{40,100}$/.test(apiKey)) {
    return { error: 'That does not look like a Fast2SMS API key. Copy it from Dev API in your Fast2SMS account.' };
  }
  if (f.route === 'dlt') {
    if (!senderId || !dltMessageId) return { error: 'The DLT route needs both a Sender ID and a Message ID.' };
    if (!/^[A-Za-z]{3,6}$/.test(senderId)) return { error: 'Sender ID is 3 to 6 letters (your DLT-approved header).' };
    if (!/^\d{3,20}$/.test(dltMessageId)) return { error: 'Message ID is a number (see DLT Manager in Fast2SMS).' };
  }
  if (f.route === 'smart') {
    // One general template, or a registration and a password reset template (delivery is optional).
    if (!ids.otpId && !(ids.otpIdRegister && ids.otpIdReset)) {
      return {
        error:
          'The Smart OTP route needs an OTP ID: either one general template, or both a registration and a password reset template (Fast2SMS → Smart OTP).',
      };
    }
    for (const id of Object.values(ids)) {
      if (id && !OTP_ID.test(id)) return { error: 'OTP IDs may only contain letters, digits, - and _.' };
    }
  }
  const changed = <K extends keyof typeof ids>(k: K) => f.route === 'smart' && ids[k] !== (current[k] ?? '');
  const payload: SmsPayload = {
    ...(apiKey ? { apiKey } : {}),
    ...(f.route !== current.route ? { route: f.route } : {}),
    ...(f.route === 'dlt' && senderId !== current.senderId ? { senderId } : {}),
    ...(f.route === 'dlt' && dltMessageId !== current.dltMessageId ? { dltMessageId } : {}),
    ...(changed('otpId') && ids.otpId ? { otpId: ids.otpId } : {}),
    ...(changed('otpIdRegister') && ids.otpIdRegister ? { otpIdRegister: ids.otpIdRegister } : {}),
    ...(changed('otpIdReset') && ids.otpIdReset ? { otpIdReset: ids.otpIdReset } : {}),
    ...(changed('otpIdDelivery') && ids.otpIdDelivery ? { otpIdDelivery: ids.otpIdDelivery } : {}),
  };
  if (Object.keys(payload).length === 0) return { error: 'Nothing changed. Enter a new API key or change the route.' };
  return { payload };
}
