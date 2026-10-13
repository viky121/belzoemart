import {
  emailLoginSchema,
  emailRegisterSchema,
  mobileAuthResponseSchema,
  otpRequestSchema,
  otpVerifySchema,
  type MobileAuthResponse,
} from '@belzo/shared';

import { apiRequest } from '@/api/client';
import { ApiError } from '@/api/errors';
import type { OtpRequestResult } from '@/api/types';

/**
 * Auth endpoints (design §4.1). Auth responses are runtime-parsed (design §4.3, §5.3): a
 * server that rotated the cookie instead of returning a body refresh token is reported as
 * `ServerTooOld` so the UI can tell the user to update rather than silently fail.
 */
function parseAuth(json: unknown): MobileAuthResponse {
  const parsed = mobileAuthResponseSchema.safeParse(json);
  if (parsed.success) return parsed.data;
  const missingRefresh =
    typeof json === 'object' &&
    json !== null &&
    'accessToken' in json &&
    !('refreshToken' in json);
  if (missingRefresh) throw new ApiError({ kind: 'config', code: 'ServerTooOld' });
  throw new ApiError({ kind: 'parse', message: 'Invalid auth response' });
}

/** Request a phone or email OTP. Returns the request id, expiry and (dev builds) the demo code. */
export function requestOtp(input: { phone?: string; email?: string }): Promise<OtpRequestResult> {
  const body = otpRequestSchema.parse(input);
  return apiRequest<OtpRequestResult>('/auth/otp/request', { method: 'POST', body });
}

export async function verifyOtp(input: {
  requestId: string;
  code: string;
}): Promise<MobileAuthResponse> {
  const body = otpVerifySchema.parse(input);
  return parseAuth(await apiRequest<unknown>('/auth/otp/verify', { method: 'POST', body }));
}

export async function loginPassword(input: {
  email: string;
  password: string;
}): Promise<MobileAuthResponse> {
  const body = emailLoginSchema.parse(input);
  return parseAuth(await apiRequest<unknown>('/auth/login', { method: 'POST', body }));
}

export async function registerAccount(input: {
  name: string;
  email: string;
  password: string;
}): Promise<MobileAuthResponse> {
  const body = emailRegisterSchema.parse(input);
  return parseAuth(await apiRequest<unknown>('/auth/register', { method: 'POST', body }));
}
