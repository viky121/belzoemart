import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { logger } from '@/lib/logger';
import { theme } from '@/theme';
import { Button } from '@/ui/Button';

interface Props {
  children: ReactNode;
  /** Called after the boundary resets (the app navigates Home). */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/** Root render-error boundary (design §9.2): "Something went wrong" + "Try again". */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('render error', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>Please try again. If this keeps happening, restart the app.</Text>
        <Button title="Try again" onPress={this.reset} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.bg,
  },
  title: { ...theme.typography.heading, color: theme.colors.inkStrong },
  body: { ...theme.typography.body, color: theme.colors.muted, textAlign: 'center' },
});
