import {
  mobileAuthResponseSchema,
  otpRequestSchema,
  otpVerifySchema,
  passwordResetSchema,
  identifierLoginSchema,
  registerAccountSchema,
  type MobileAuthResponse,
  type OtpPurpose,
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

/**
 * Request a phone or email OTP. `purpose` makes the server check the account first: "register" refuses a
 * number that is already registered, "reset" / "login" only go to existing accounts.
 */
export function requestOtp(input: {
  phone?: string;
  email?: string;
  purpose?: OtpPurpose;
}): Promise<OtpRequestResult> {
  const body = otpRequestSchema.parse(input);
  return apiRequest<OtpRequestResult>('/auth/otp/request', { method: 'POST', body });
}

/** Sign in with a code sent to an existing account's mobile number. */
export async function verifyOtp(input: {
  requestId: string;
  code: string;
}): Promise<MobileAuthResponse> {
  const body = otpVerifySchema.parse(input);
  return parseAuth(await apiRequest<unknown>('/auth/otp/verify', { method: 'POST', body }));
}

export interface OtpProof {
  /** Signed receipt that this number / email was verified; sent when creating the account / resetting the password. */
  proof: string;
  kind: 'phone' | 'email';
  value: string;
}

/** Check a code WITHOUT signing in (sign-up and forgot-password). */
export function proveOtp(input: { requestId: string; code: string }): Promise<OtpProof> {
  const body = otpVerifySchema.parse(input);
  return apiRequest<OtpProof>('/auth/otp/prove', { method: 'POST', body });
}

/** Sign in with mobile number OR email, plus the password. */
export async function loginWithIdentifier(input: { identifier: string; password: string }): Promise<MobileAuthResponse> {
  const body = identifierLoginSchema.parse(input);
  return parseAuth(await apiRequest<unknown>('/auth/login/identifier', { method: 'POST', body }));
}

/** Create an account: name, mobile (verified by OTP), password twice; the email is optional. */
export async function registerAccount(input: {
  name: string;
  /** Optional; when given it must come with its `emailProof`. */
  email?: string;
  phone: string;
  password: string;
  confirmPassword: string;
  phoneProof: string;
  emailProof?: string;
}): Promise<MobileAuthResponse> {
  const body = registerAccountSchema.parse(input);
  return parseAuth(await apiRequest<unknown>('/auth/register', { method: 'POST', body }));
}

/** Forgot password: new password after verifying the mobile number by OTP. */
export function resetPassword(input: {
  proof: string;
  password: string;
  confirmPassword: string;
}): Promise<{ success: true }> {
  const body = passwordResetSchema.parse(input);
  return apiRequest<{ success: true }>('/auth/password/reset', { method: 'POST', body });
}
