'use client';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ApiClientError } from '@/lib/api-client';
import { adminFetch } from '@/lib/admin-api';

/** The signed-in admin and what they may do (from GET /admin/auth/me, read fresh from the server). */
export interface AdminMe {
  id: string;
  name: string;
  email: string;
  roles: string[];
  isSuperAdmin: boolean;
  mfaEnabled: boolean;
  permissions: string[];
}

/** `can('a','b')` is true when the admin holds ANY of the keys. The Super Admin can do everything. */
export function makeCan(me: AdminMe | null): (...keys: string[]) => boolean {
  if (!me) return () => false;
  const held = new Set(me.permissions);
  return (...keys) => me.isSuperAdmin || keys.some((k) => held.has(k));
}

export type SessionState = 'loading' | 'ready' | 'signed-out';

export interface AdminSession {
  me: AdminMe | null;
  state: SessionState;
  can: (...keys: string[]) => boolean;
  /** Ask the server again (silently). Marks the session signed out when the server says 401. */
  refresh: () => Promise<void>;
  /** Forget the admin (on logout or on the login screen). */
  clear: () => void;
}

const SessionContext = createContext<AdminSession | null>(null);

export function useAdminSession(): AdminSession {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useAdminSession must be used inside AdminSessionProvider');
  return ctx;
}

export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [state, setState] = useState<SessionState>('loading');

  const refresh = useCallback(async () => {
    try {
      setMe(await adminFetch<AdminMe>('/admin/auth/me'));
      setState('ready');
    } catch (err) {
      // 401 (after the silent token refresh) or 403 (switched off): no usable session.
      const status = err instanceof ApiClientError ? err.payload.statusCode : 0;
      if (status === 401 || status === 403) {
        setMe(null);
        setState('signed-out');
      }
      // Any other failure (network blip): keep what we have and try again at the next click.
    }
  }, []);

  const clear = useCallback(() => {
    setMe(null);
    setState('loading');
  }, []);

  const value = useMemo<AdminSession>(() => ({ me, state, can: makeCan(me), refresh, clear }), [me, state, refresh, clear]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Test seam: render a tree with a fixed session. */
export function StaticAdminSession({ me, children }: { me: AdminMe | null; children: React.ReactNode }) {
  const value: AdminSession = {
    me,
    state: me ? 'ready' : 'loading',
    can: makeCan(me),
    refresh: async () => undefined,
    clear: () => undefined,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
