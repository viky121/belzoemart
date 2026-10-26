import { QueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/api/client';
import { rotateGuestToken } from '@/api/guest-token';
import { qk } from '@/api/query-keys';
import { tokenManager } from '@/api/token-manager';
import type { CartView } from '@/api/types';
import { secure } from '@/lib/secure';
import { useSessionStore } from '@/store/session';

import { completeLogin } from '../session';

jest.mock('@/api/client', () => ({ apiRequest: jest.fn() }));
jest.mock('@/api/guest-token', () => ({ rotateGuestToken: jest.fn() }));
jest.mock('@/api/token-manager', () => ({ tokenManager: { setSession: jest.fn() } }));
jest.mock('@/lib/secure', () => ({
  secure: {
    peekGuestToken: jest.fn(),
    setPendingMerge: jest.fn(),
    deletePendingMerge: jest.fn(),
  },
}));

const mockApi = apiRequest as jest.Mock;
const mockRotate = rotateGuestToken as jest.Mock;
const mockPeek = secure.peekGuestToken as jest.Mock;
const mockSetPending = secure.setPendingMerge as jest.Mock;
const mockDeletePending = secure.deletePendingMerge as jest.Mock;
const mockSetSession = tokenManager.setSession as jest.Mock;

const RES = {
  accessToken: 'access-1',
  expiresIn: 900,
  refreshToken: 'refresh-1',
  customer: { id: 'c1', name: 'Vikas', email: null, phone: null, locale: 'en' },
};
const CART: CartView = { cartId: 'cart-1', items: [] };

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({ status: 'guest', customer: null });
  mockSetSession.mockResolvedValue(undefined);
  mockSetPending.mockResolvedValue(undefined);
  mockDeletePending.mockResolvedValue(undefined);
  mockRotate.mockResolvedValue('guest-new');
});

describe('completeLogin (design §6.4)', () => {
  it('merges with the guest token and sets the cart cache from the response', async () => {
    mockPeek.mockResolvedValue('guest-1');
    mockApi.mockResolvedValue(CART);
    const qc = new QueryClient();
    const setQueryData = jest.spyOn(qc, 'setQueryData');

    await completeLogin(RES, qc);

    expect(mockSetSession).toHaveBeenCalledWith({
      accessToken: 'access-1',
      expiresIn: 900,
      refreshToken: 'refresh-1',
    });
    expect(mockApi).toHaveBeenCalledWith(
      '/cart/merge',
      expect.objectContaining({ method: 'POST', body: { guestToken: 'guest-1' } }),
    );
    expect(setQueryData).toHaveBeenCalledWith(qk.cart('customer'), CART);
    expect(useSessionStore.getState().status).toBe('authenticated');
  });

  it('rotates the guest token and clears the pending merge after success', async () => {
    mockPeek.mockResolvedValue('guest-1');
    mockApi.mockResolvedValue(CART);

    await completeLogin(RES, new QueryClient());

    expect(mockRotate).toHaveBeenCalledTimes(1);
    expect(mockDeletePending).toHaveBeenCalledTimes(1);
    expect(mockSetPending).not.toHaveBeenCalled();
  });

  it('stores the pending merge and still completes the login when the merge fails', async () => {
    mockPeek.mockResolvedValue('guest-1');
    mockApi.mockRejectedValue(new Error('merge failed'));

    await expect(completeLogin(RES, new QueryClient())).resolves.toBeUndefined();

    expect(mockSetPending).toHaveBeenCalledWith('guest-1');
    expect(mockRotate).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('authenticated');
  });

  it('makes no merge call when there is no guest token', async () => {
    mockPeek.mockResolvedValue(null);

    await completeLogin(RES, new QueryClient());

    expect(mockApi).not.toHaveBeenCalled();
    expect(mockRotate).not.toHaveBeenCalled();
    expect(mockSetPending).not.toHaveBeenCalled();
  });
});
