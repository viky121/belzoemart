import type { OtpPurpose } from '@belzo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { tokenManager } from '@/api/token-manager';
import type { OtpRequestResult } from '@/api/types';

import {
  loginWithIdentifier,
  proveOtp,
  registerAccount,
  requestOtp,
  resetPassword,
  verifyOtp,
  type OtpProof,
} from './api';
import { completeLogin } from './session';

/** Request a phone/email OTP (no session change yet; the code is verified on OtpVerify or with `useProveOtp`). */
export function useRequestOtp() {
  return useMutation<OtpRequestResult, unknown, { phone?: string; email?: string; purpose?: OtpPurpose }>({
    mutationFn: requestOtp,
  });
}

/** Verify an OTP and complete the login (session + guest-cart merge). */
export function useVerifyOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; code: string }) => {
      const res = await verifyOtp(input);
      await completeLogin(res, queryClient);
      return res;
    },
  });
}

/** Check an OTP without signing in; the result is the proof sign-up / password reset need. */
export function useProveOtp() {
  return useMutation<OtpProof, unknown, { requestId: string; code: string }>({ mutationFn: proveOtp });
}

/** Sign in with mobile number OR email, plus the password. */
export function useIdentifierLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { identifier: string; password: string }) => {
      const res = await loginWithIdentifier(input);
      await completeLogin(res, queryClient);
      return res;
    },
  });
}

/** Create the account and sign in. */
export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Parameters<typeof registerAccount>[0]) => {
      const res = await registerAccount(input);
      await completeLogin(res, queryClient);
      return res;
    },
  });
}

export function useResetPassword() {
  return useMutation({ mutationFn: resetPassword });
}

/** Logout. The session-expired listener (App.tsx) clears the cache and resets to Home. */
export function useLogout() {
  return useMutation({ mutationFn: () => tokenManager.logout() });
}
