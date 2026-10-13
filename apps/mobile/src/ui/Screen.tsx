import type { ReactElement, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { theme } from '@/theme';

import { OfflineBanner } from './OfflineBanner';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Safe-area edges; SDK 57 enforces edge-to-edge. Default: top, left, right. */
  edges?: Edge[];
  padded?: boolean;
}

export function Screen({
  children,
  scroll = false,
  refreshControl,
  edges = ['top', 'left', 'right'],
  padded = false,
}: ScreenProps) {
  return (
    <SafeAreaView style={styles.root} edges={edges}>
      <OfflineBanner />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[padded && styles.padded]}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, padded && styles.padded]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  fill: { flex: 1 },
  padded: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
});
