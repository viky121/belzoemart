import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

/** Pill chip; selected chips use the primary tint with dark text. */
export function Chip({ label, selected = false, onPress }: ChipProps) {
  const brand = useBrand();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={[
        styles.chip,
        selected && styles.selected,
        selected && { borderColor: brand.primary, backgroundColor: brand.primary },
      ]}
    >
      <Text
        style={[styles.text, selected && styles.selectedText]}
        maxFontSizeMultiplier={theme.maxFontSizeMultiplier}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  selected: { borderColor: theme.colors.primaryStrong, backgroundColor: theme.colors.primaryStrong },
  text: { ...theme.typography.body, color: theme.colors.ink },
  selectedText: { color: theme.colors.white, fontWeight: '700' },
});
