import { useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MESSAGES } from '@/api/errors';
import { queryClient, setupQueryManagers } from '@/api/query-client';
import { sessionEvents } from '@/api/token-manager';
import { envResult } from '@/config/env';
import { RootNavigator } from '@/navigation/RootNavigator';
import { theme } from '@/theme';
import { showToast } from '@/ui/Toast';

import { AnimatedSplash } from './AnimatedSplash';
import { useBoot } from './boot';
import { ErrorBoundary } from './ErrorBoundary';
import { AppProviders, NavigationProvider, resetToHome } from './providers';

/**
 * Session-expired listener (design §5.3): clear the cache, toast (not for an explicit logout) and
 * reset to Home. Mounted after boot, so a boot-time rejection shows no toast (design §9.2).
 */
function SessionExpiryListener() {
  const client = useQueryClient();
  useEffect(
    () =>
      sessionEvents.on('expired', (reason) => {
        client.clear();
        if (reason !== 'logout') showToast({ message: MESSAGES.sessionExpired, tone: 'info' });
        resetToHome();
      }),
    [client],
  );
  return null;
}

function BootGate() {
  const { ready, onboardingDone } = useBoot(queryClient);
  const [splashDone, setSplashDone] = useState(false);
  // The native splash stays visible until boot settles, so nothing renders while restoring.
  if (!ready) return null;
  return (
    <NavigationProvider>
      <SessionExpiryListener />
      <ErrorBoundary onReset={resetToHome}>
        <RootNavigator initialRouteName={onboardingDone ? 'Main' : 'Onboarding'} />
      </ErrorBoundary>
      {!splashDone ? <AnimatedSplash onDone={() => setSplashDone(true)} /> : null}
    </NavigationProvider>
  );
}

/** Fatal screen for a broken build config (design §9.2). Only possible with a bad build. */
function ConfigErrorScreen({ details }: { details: string }) {
  return (
    <SafeAreaView style={styles.fatal}>
      <ScrollView contentContainerStyle={styles.fatalBody}>
        <Text style={styles.fatalTitle} accessibilityRole="header">
          App configuration error
        </Text>
        <Text style={styles.fatalText}>
          This build is misconfigured. Please install an updated version.
        </Text>
        {__DEV__ ? <Text style={styles.fatalDetails}>{details}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  useEffect(() => setupQueryManagers(), []);
  return (
    <AppProviders queryClient={queryClient}>
      <StatusBar style="dark" />
      {envResult.ok ? <BootGate /> : <ConfigErrorScreen details={envResult.error} />}
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  fatal: { flex: 1, backgroundColor: theme.colors.bg },
  fatalBody: { padding: theme.spacing.xl, gap: theme.spacing.md },
  fatalTitle: { ...theme.typography.heading, color: theme.colors.danger },
  fatalText: { ...theme.typography.bodyLg, color: theme.colors.ink },
  fatalDetails: { ...theme.typography.caption, color: theme.colors.muted },
});
