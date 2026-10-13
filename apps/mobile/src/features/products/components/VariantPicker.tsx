import { variantText, type VariantDto } from '@belzo/shared';
import { StyleSheet, View } from 'react-native';

import { theme } from '@/theme';
import { Chip } from '@/ui';

export interface VariantPickerProps {
  variants: VariantDto[];
  selectedId: string;
  onSelect: (variantId: string) => void;
}

function variantLabel(v: VariantDto): string {
  const text = variantText(v.attributes);
  if (text) return text;
  const values = Object.values(v.attributes);
  return values.length > 0 ? values.join(' / ') : v.sku;
}

/** Variant chips, labelled by attributes (design §11 ProductDetail). Hidden for a single variant. */
export function VariantPicker({ variants, selectedId, onSelect }: VariantPickerProps) {
  if (variants.length <= 1) return null;
  return (
    <View style={styles.row}>
      {variants.map((v) => (
        <Chip
          key={v.id}
          label={variantLabel(v)}
          selected={v.id === selectedId}
          onPress={() => onSelect(v.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
});
