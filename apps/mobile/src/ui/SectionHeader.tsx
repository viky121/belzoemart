import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel = 'View all', onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="link"
          accessibilityLabel={`${actionLabel}: ${title}`}
          style={styles.action}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  title: { ...theme.typography.title, color: theme.colors.inkStrong, flex: 1 },
  action: {
    minHeight: theme.touch.minTouch,
    justifyContent: 'center',
    paddingLeft: theme.spacing.md,
  },
  actionText: { ...theme.typography.body, color: theme.colors.primaryStrong, fontWeight: '700' },
});
