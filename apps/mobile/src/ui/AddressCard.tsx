import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Address } from '@/api/types';
import { theme } from '@/theme';

export interface AddressCardProps {
  address: Address;
  selected?: boolean;
  onPress?: () => void;
  actions?: ReactNode;
}

const LABELS: Record<Address['label'], string> = { home: 'Home', work: 'Work', other: 'Other' };

export function addressLines(a: Address): string[] {
  return [a.line1, a.line2 ?? '', `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean);
}

export function AddressCard({ address, selected, onPress, actions }: AddressCardProps) {
  const lines = addressLines(address);
  const content = (
    <View style={[styles.card, selected && styles.selected]}>
      <View style={styles.header}>
        <Text style={styles.name}>{address.fullName}</Text>
        <Text style={styles.tag}>{LABELS[address.label]}</Text>
        {address.isDefault ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Default</Text>
          </View>
        ) : null}
      </View>
      {lines.map((l) => (
        <Text key={l} style={styles.line}>
          {l}
        </Text>
      ))}
      <Text style={styles.line}>{address.phone}</Text>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: Boolean(selected), checked: Boolean(selected) }}
      accessibilityLabel={[address.fullName, ...lines].join(', ')}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.xxs,
  },
  selected: { borderColor: theme.colors.primaryStrong, borderWidth: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' },
  name: { ...theme.typography.bodyLg, color: theme.colors.inkStrong, fontWeight: '700' },
  tag: { ...theme.typography.caption, color: theme.colors.muted },
  badge: {
    backgroundColor: theme.colors.successBg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  badgeText: { ...theme.typography.caption, color: theme.colors.brandStrong, fontWeight: '700' },
  line: { ...theme.typography.body, color: theme.colors.ink },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
});
