import type { MobileAuthResponse } from '@belzo/shared';
import type { QueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/api/client';
import { rotateGuestToken } from '@/api/guest-token';
import { qk } from '@/api/query-keys';
import { tokenManager } from '@/api/token-manager';
import type { CartView } from '@/api/types';
import { logger } from '@/lib/logger';
import { secure } from '@/lib/secure';
import { useSessionStore } from '@/store/session';

/**
 * Login success and guest-cart merge (design §6.4). The caller must have already parsed `res`
 * with `mobileAuthResponseSchema` (the auth api does). A merge failure never
 * blocks the login: a failed merge is stored and retried once on the next boot (§5.4).
 */
export async function completeLogin(
  res: MobileAuthResponse,
  queryClient: QueryClient,
): Promise<void> {
  await tokenManager.setSession({
    accessToken: res.accessToken,
    expiresIn: res.expiresIn,
    refreshToken: res.refreshToken,
  });
  useSessionStore.getState().setAuthenticated(res.customer);
  queryClient.removeQueries({ queryKey: ['cart'] });

  const guest = await secure.peekGuestToken();
  if (guest) {
    try {
      const view = await apiRequest<CartView>('/cart/merge', {
        method: 'POST',
        auth: 'required',
        body: { guestToken: guest },
      });
      queryClient.setQueryData(qk.cart('customer'), view);
      await rotateGuestToken();
      await secure.deletePendingMerge();
    } catch (e) {
      // Keep the guest token for a retry on the next boot; never block the login.
      await secure.setPendingMerge(guest);
      logger.warn('cart merge on login failed', e);
    }
  }

  queryClient.invalidateQueries({ queryKey: qk.wishlist });
  queryClient.invalidateQueries({ queryKey: qk.addresses });
  queryClient.invalidateQueries({ queryKey: qk.orders });


}
