import type { QueryClient } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { apiRequest } from '@/api/client';
import { isApiError } from '@/api/errors';
import { rotateGuestToken } from '@/api/guest-token';
import { qk } from '@/api/query-keys';
import { tokenManager } from '@/api/token-manager';
import type { CartView } from '@/api/types';
import { readOnboardingDone } from '@/features/onboarding/onboarding-flag';
import { logger } from '@/lib/logger';
import { secure } from '@/lib/secure';
import { hydrateStores } from '@/store';
import { sessionStore } from '@/store/session';

/**
 * Session restore (design §5.4). Never blocks on /me. The boot refresh does not retry 429, so the
 * only bound on boot time is the refresh request's 10 s timeout.
 */
export async function restoreSession(): Promise<void> {
  const rt = await secure.getRefreshToken();
  if (!rt) {
    sessionStore.setGuest();
    return;
  }
  sessionStore.setStatus('authenticated');
  try {
    await tokenManager.refresh({ retry429: false });
  } catch (e) {
    // auth: expireSession already switched to guest. network/timeout/429/5xx: stay authenticated
    // with no access token; the first online request refreshes lazily.
    if (!isApiError(e) || e.kind !== 'auth')
      logger.warn('boot refresh failed', isApiError(e) ? e.kind : e);
  }
}

/** Retries a cart merge that failed after a previous login, once per boot (design §5.4 / §6.4). */
export async function retryPendingMerge(queryClient: QueryClient): Promise<void> {
  if (sessionStore.status !== 'authenticated') return;
  const guestToken = await secure.getPendingMergeToken();
  if (!guestToken) return;
  try {
    const view = await apiRequest<CartView>('/cart/merge', {
      method: 'POST',
      auth: 'required',
      body: { guestToken },
    });
    queryClient.setQueryData(qk.cart('customer'), view);
    await rotateGuestToken();
    await secure.deletePendingMerge();
  } catch (e) {
    // Kept for the next boot; the server deletes the guest cart only on success.
    logger.warn('pending cart merge failed', isApiError(e) ? e.kind : e);
  }
}

export interface BootState {
  ready: boolean;
  onboardingDone: boolean;
}

/** Hydrates stores, restores the session and reads the onboarding flag; then hides the splash. */
export async function runBoot(queryClient: QueryClient): Promise<{ onboardingDone: boolean }> {
  const [, , onboardingDone] = await Promise.all([
    hydrateStores().catch((e: unknown) => logger.warn('store hydration failed', e)),
    restoreSession().catch((e: unknown) => {
      logger.warn('session restore failed', e);
      if (sessionStore.status === 'restoring') sessionStore.setGuest();
    }),
    readOnboardingDone().catch(() => false),
  ]);
  void retryPendingMerge(queryClient);
  return { onboardingDone };
}

export function useBoot(queryClient: QueryClient): BootState {
  const [state, setState] = useState<BootState>({ ready: false, onboardingDone: false });
  useEffect(() => {
    let alive = true;
    void runBoot(queryClient).then(({ onboardingDone }) => {
      if (!alive) return;
      setState({ ready: true, onboardingDone });
      void SplashScreen.hideAsync().catch(() => undefined);
    });
    return () => {
      alive = false;
    };
  }, [queryClient]);
  return state;
}
