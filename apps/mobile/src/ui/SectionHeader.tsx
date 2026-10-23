import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Section title with a small brand-coloured bar, and a pill-shaped "View all" action. */
export function SectionHeader({ title, actionLabel = 'View all', onAction }: SectionHeaderProps) {
  const brand = useBrand();
  return (
    <View style={styles.row}>
      <View style={styles.titleWrap}>
        <View style={[styles.bar, { backgroundColor: brand.active ? brand.accent : brand.primary }]} />
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="link"
          accessibilityLabel={`${actionLabel}: ${title}`}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          style={[styles.action, { backgroundColor: brand.primaryBg }]}
        >
          <Text style={[styles.actionText, { color: brand.primary }]}>{actionLabel}</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={brand.primary} />
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
    gap: theme.spacing.sm,
  },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  bar: { width: 4, height: 18, borderRadius: 2 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: theme.colors.inkStrong, flexShrink: 1 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
  },
  actionText: { fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
});
