import { variantText, type VariantDto } from '@belzo/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

export interface VariantPickerProps {
  variants: VariantDto[];
  selectedId: string;
  onSelect: (variantId: string) => void;
}

function fallbackLabel(v: VariantDto): string {
  const text = variantText(v.attributes);
  if (text) return text;
  const values = Object.values(v.attributes);
  return values.length > 0 ? values.join(' / ') : v.sku;
}

/**
 * Option pills (design: "Size: S M L XL"). When every variant varies on a single
 * attribute, the attribute name becomes the heading and the pills show just values.
 */
export function VariantPicker({ variants, selectedId, onSelect }: VariantPickerProps) {
  if (variants.length <= 1) return null;
  const keys = Array.from(new Set(variants.flatMap((v) => Object.keys(v.attributes))));
  const single = keys.length === 1 ? keys[0]! : null;
  const heading = single ? `${single.charAt(0).toUpperCase()}${single.slice(1)}:` : 'Options:';
  const selected = variants.find((v) => v.id === selectedId);
  const selectedValue = single && selected ? String(selected.attributes[single] ?? '') : '';

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>
        {heading} {selectedValue ? <Text style={styles.headingValue}>{selectedValue}</Text> : null}
      </Text>
      <View style={styles.row}>
        {variants.map((v) => {
          const on = v.id === selectedId;
          const label = single ? String(v.attributes[single] ?? fallbackLabel(v)) : fallbackLabel(v);
          return (
            <Pressable
              key={v.id}
              onPress={() => onSelect(v.id)}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: on, disabled: !v.inStock }}
              style={[styles.pill, on && styles.pillOn, !v.inStock && styles.pillOut]}
            >
              <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  heading: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '700' },
  headingValue: { fontWeight: '600', color: theme.colors.ink },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  pill: {
    minWidth: 52,
    minHeight: 40,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOn: { borderColor: theme.colors.primaryStrong, borderWidth: 2, backgroundColor: theme.colors.primaryBg },
  pillOut: { opacity: 0.45 },
  pillText: { ...theme.typography.body, color: theme.colors.ink, fontWeight: '600' },
  pillTextOn: { color: theme.colors.primaryStrong, fontWeight: '800' },
});
