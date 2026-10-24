import type { CustomerSummary } from '@belzo/shared';
import { create } from 'zustand';

export type SessionStatus = 'restoring' | 'authenticated' | 'guest';

interface SessionState {
  status: SessionStatus;
  customer: CustomerSummary | null;
  setStatus: (status: SessionStatus) => void;
  setGuest: () => void;
  setAuthenticated: (customer: CustomerSummary | null) => void;
  setCustomer: (customer: CustomerSummary | null) => void;
}

/** Session status (memory only, never persisted; design §6.3). */
export const useSessionStore = create<SessionState>()((set) => ({
  status: 'restoring',
  customer: null,
  setStatus: (status) => set({ status }),
  setGuest: () => set({ status: 'guest', customer: null }),
  setAuthenticated: (customer) => set({ status: 'authenticated', customer }),
  setCustomer: (customer) => set({ customer }),
}));

/** Non-React accessor used by the API core. */
export const sessionStore = {
  get status(): SessionStatus {
    return useSessionStore.getState().status;
  },
  setStatus: (s: SessionStatus) => useSessionStore.getState().setStatus(s),
  setGuest: () => useSessionStore.getState().setGuest(),
  setAuthenticated: (c: CustomerSummary | null) => useSessionStore.getState().setAuthenticated(c),
};

/** Cart identity for query keys: derived only from the session status (design §6.2). */
export function useCartIdentity(): 'customer' | 'guest' {
  return useSessionStore((s) => (s.status === 'authenticated' ? 'customer' : 'guest'));
}
