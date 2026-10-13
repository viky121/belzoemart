import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

import { ApiError } from './errors';
import { STALE } from './query-keys';

/** Retry only transient failures, at most twice (design §5.5). */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return (
    failureCount < 2 &&
    error instanceof ApiError &&
    (error.kind === 'network' || error.kind === 'timeout' || error.status >= 500)
  );
}

export function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 4000) + Math.random() * 250;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE.default,
        gcTime: 10 * 60_000,
        retry: shouldRetryQuery,
        retryDelay,
      },
      mutations: { retry: 0 },
    },
  });
}

export const queryClient = createQueryClient();

/** Wires TanStack's online/focus managers to NetInfo and AppState. Returns a cleanup. */
export function setupQueryManagers(): () => void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
  );
  const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });
  return () => sub.remove();
}
