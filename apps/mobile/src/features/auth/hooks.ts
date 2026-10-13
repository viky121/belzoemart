import { useMutation, useQueryClient } from '@tanstack/react-query';

import { tokenManager } from '@/api/token-manager';
import type { OtpRequestResult } from '@/api/types';

import { loginPassword, registerAccount, requestOtp, verifyOtp } from './api';
import { completeLogin } from './session';

/** Request a phone/email OTP (no session change yet; the code is verified on OtpVerify). */
export function useRequestOtp() {
  return useMutation<OtpRequestResult, unknown, { phone?: string; email?: string }>({
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

export function usePasswordLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const res = await loginPassword(input);
      await completeLogin(res, queryClient);
      return res;
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; email: string; password: string }) => {
      const res = await registerAccount(input);
      await completeLogin(res, queryClient);
      return res;
    },
  });
}

/** Logout. The session-expired listener (App.tsx) clears the cache and resets to Home. */
export function useLogout() {
  return useMutation({ mutationFn: () => tokenManager.logout() });
}
