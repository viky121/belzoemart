import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { toApiError, userMessage, MESSAGES } from '@/api/errors';
import { theme } from '@/theme';

import { Button } from './Button';

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

/** Screen-level error with Retry; shows a short correlation ref when the server sent one. */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const err = toApiError(error);
  const message = userMessage(err) || MESSAGES.generic;
  const showRef = err.correlationId && !message.includes('Ref:');
  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <MaterialCommunityIcons
        name={err.kind === 'network' ? 'wifi-off' : 'alert-circle-outline'}
        size={48}
        color={theme.colors.mutedSoft}
      />
      <Text style={styles.message}>{message}</Text>
      {showRef ? <Text style={styles.ref}>Ref: {err.correlationId!.slice(0, 8)}</Text> : null}
      {onRetry ? (
        <Button title="Retry" variant="secondary" onPress={onRetry} style={styles.retry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  message: { ...theme.typography.bodyLg, color: theme.colors.ink, textAlign: 'center' },
  ref: { ...theme.typography.caption, color: theme.colors.muted },
  retry: { marginTop: theme.spacing.md },
});
