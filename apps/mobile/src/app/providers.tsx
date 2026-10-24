import {
  createNavigationContainerRef,
  DefaultTheme,
  NavigationContainer,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { createLinking } from '@/navigation/linking';
import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';
import { ToastProvider } from '@/ui/Toast';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const navTheme: NavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: theme.colors.primaryStrong,
    background: theme.colors.bg,
    card: theme.colors.surface,
    text: theme.colors.inkStrong,
    border: theme.colors.border,
    notification: theme.colors.orange,
  },
};

const linking = createLinking();

/** Providers that exist before boot settles: QueryClient, SafeArea, Toast. */
export function AppProviders({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: ReactNode;
}) {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** NavigationContainer; mounted only after boot settles (design §2.1, §2.5). */
export function NavigationProvider({ children }: { children: ReactNode }) {
  return (
    <NavigationContainer ref={navigationRef} linking={linking} theme={navTheme}>
      {children}
    </NavigationContainer>
  );
}

/** Resets the stack to Home (logout, expiry, error-boundary reset). */
export function resetToHome(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'HomeTab' } }] });
}
