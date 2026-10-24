import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/ui/Toast';

const TEST_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

export interface ProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
  /** Wrap in a NavigationContainer (default true). */
  navigation?: boolean;
}

/** Renders `ui` inside QueryClient (retry off), SafeArea test metrics, Navigation and Toast. */
export async function renderWithProviders(ui: ReactElement, opts: ProvidersOptions = {}) {
  const { queryClient = createTestQueryClient(), navigation = true, ...rest } = opts;
  function Wrapper({ children }: { children: ReactNode }) {
    const content = (
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    );
    return navigation ? <NavigationContainer>{content}</NavigationContainer> : content;
  }
  const result = await render(ui, { wrapper: Wrapper, ...rest });
  return { queryClient, ...result };
}
