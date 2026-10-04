'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch } from './api-client';
import { cartApi } from './cart-api';

export interface CustomerSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  locale: string;
}

interface AuthState {
  accessToken: string | null;
  customer: CustomerSummary | null;
}

interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  customer: CustomerSummary;
}

interface AuthContextValue extends AuthState {
  /** False until the initial session-restore attempt has settled. Lets the UI
   *  avoid flashing a "logged out" state for a user who is actually signed in. */
  ready: boolean;
  setSession: (accessToken: string, customer: CustomerSummary) => void;
  logout: () => Promise<void>;
  authFetch: <T>(path: string, options?: Parameters<typeof apiFetch>[1]) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the access token in memory only (never localStorage) — the refresh
 * token lives in an httpOnly cookie. On a 401 the client can call /auth/refresh
 * to obtain a new access token (SECURITY-12).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ accessToken: null, customer: null });
  const [ready, setReady] = useState(false);

  const setSession = useCallback((accessToken: string, customer: CustomerSummary) => {
    setState({ accessToken, customer });
    // Merge any guest cart built before login into the customer's cart (BR-2)
    // so items added as a guest survive logging in. Fire-and-forget: the merge
    // broadcasts 'belzo:cart', so the header badge and cart view refresh.
    void cartApi.merge(accessToken).catch(() => undefined);
  }, []);

  // Restore the session on load: the refresh token lives in an httpOnly cookie,
  // so a silent /auth/refresh (then /me) re-establishes the in-memory session
  // after a reload. Guests simply get a 401 here, which we ignore.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const refreshed = await apiFetch<{ accessToken: string }>('/auth/refresh', { method: 'POST' });
        const me = await apiFetch<CustomerSummary>('/me', { accessToken: refreshed.accessToken });
        if (!active) return;
        setState({
          accessToken: refreshed.accessToken,
          customer: { id: me.id, name: me.name, email: me.email, phone: me.phone, locale: me.locale },
        });
      } catch {
        /* not logged in */
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setState({ accessToken: null, customer: null });
    }
  }, []);

  const authFetch = useCallback(
    async <T,>(path: string, options: Parameters<typeof apiFetch>[1] = {}): Promise<T> => {
      try {
        return await apiFetch<T>(path, { ...options, accessToken: state.accessToken ?? undefined });
      } catch (err) {
        // Attempt a single refresh on unauthorized, then retry.
        const refreshed = await apiFetch<{ accessToken: string }>('/auth/refresh', {
          method: 'POST',
        }).catch(() => null);
        if (refreshed) {
          setState((s) => ({ ...s, accessToken: refreshed.accessToken }));
          return apiFetch<T>(path, { ...options, accessToken: refreshed.accessToken });
        }
        throw err;
      }
    },
    [state.accessToken],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, ready, setSession, logout, authFetch }),
    [state, ready, setSession, logout, authFetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export type { LoginResponse };
