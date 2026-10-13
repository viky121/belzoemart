import { formatInr, type PriceSlabTier } from '@belzo/shared';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

export interface SlabTableProps {
  slabs: PriceSlabTier[];
}

/** Bulk price tiers (design §11 ProductDetail). Server prices on the product's total quantity. */
export function SlabTable({ slabs }: SlabTableProps) {
  if (slabs.length === 0) return null;
  const sorted = [...slabs].sort((a, b) => a.minQty - b.minQty);
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Bulk pricing</Text>
      {sorted.map((s) => (
        <View key={s.minQty} style={styles.row}>
          <Text style={styles.qty}>{s.minQty}+ units</Text>
          <Text style={styles.price}>{formatInr(s.unitPrice)} / unit</Text>
        </View>
      ))}
      <Text style={styles.note}>Bulk price applies on the total quantity of this product (all packs).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  heading: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  qty: { ...theme.typography.body, color: theme.colors.ink },
  price: { ...theme.typography.body, color: theme.colors.brandStrong, fontWeight: '700' },
  note: { ...theme.typography.caption, color: theme.colors.muted, marginTop: theme.spacing.xs },
});
