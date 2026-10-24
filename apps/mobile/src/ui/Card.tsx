import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from '@/theme';

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Remove the inner padding (for cards holding edge-to-edge rows or images). */
  flush?: boolean;
  testID?: string;
}

/** White rounded surface with a soft shadow; the building block of the redesigned screens. */
export function Card({ children, style, flush = false, testID }: CardProps) {
  return (
    <View style={[styles.card, !flush && styles.padded, style]} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    overflow: 'visible',
  },
  padded: { padding: theme.spacing.lg },
});
