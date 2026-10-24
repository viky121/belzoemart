import type { OtpPurpose } from '@belzo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { tokenManager } from '@/api/token-manager';
import type { OtpRequestResult } from '@/api/types';

import {
  checkRegistered,
  loginWithIdentifier,
  proveOtp,
  registerAccount,
  requestOtp,
  resetPassword,
  verifyOtp,
  type OtpProof,
} from './api';
import { completeLogin } from './session';

/**
 * True when this (already validated) mobile number / email has an account. Asked after a short pause in
 * typing. If the check cannot be made it says false: the server still refuses at OTP time and at sign-up.
 */
export function useAlreadyRegistered(kind: 'phone' | 'email', target: string | null): boolean {
  const [registered, setRegistered] = useState(false);
  useEffect(() => {
    setRegistered(false);
    if (!target) return;
    let live = true;
    const timer = setTimeout(() => {
      checkRegistered(kind === 'phone' ? { phone: target } : { email: target })
        .then((r) => live && setRegistered(r))
        .catch(() => undefined);
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, target]);
  return registered;
}

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
