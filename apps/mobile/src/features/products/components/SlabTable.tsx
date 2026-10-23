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
  // Lives inside a Card, so no border of its own.
  wrap: { gap: theme.spacing.xs },
  heading: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: theme.colors.inkStrong, marginBottom: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primaryBg,
  },
  qty: { ...theme.typography.body, color: theme.colors.ink },
  price: { ...theme.typography.body, color: theme.colors.brandStrong, fontWeight: '700' },
  note: { ...theme.typography.caption, color: theme.colors.muted, marginTop: theme.spacing.xs },
});
