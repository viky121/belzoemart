import { discountPct, formatInr, type Money } from '@belzo/shared';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

import { DiscountBadge } from './DiscountBadge';

export interface PriceDisplayProps {
  /** Selling price in paise. */
  price: number;
  /** MRP in paise; struck through only when higher than price. */
  mrp?: number | null;
  size?: 'sm' | 'md' | 'lg';
}

/** Accessible price summary: "Price ₹X, MRP ₹Y, Z% off". */
export function priceA11yLabel(price: number, mrp?: number | null): string {
  const parts = [`Price ${formatInr(price)}`];
  if (mrp != null && mrp > price) {
    parts.push(`MRP ${formatInr(mrp)}`);
    const pct = discountPct(mrp as Money, price as Money);
    if (pct > 0) parts.push(`${pct}% off`);
  }
  return parts.join(', ');
}

const SIZES = { sm: 14, md: 18, lg: 22 } as const;

export function PriceDisplay({ price, mrp, size = 'md' }: PriceDisplayProps) {
  const showMrp = mrp != null && mrp > price;
  const pct = showMrp ? discountPct(mrp as Money, price as Money) : 0;
  const fontSize = SIZES[size];
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={priceA11yLabel(price, mrp)}
    >
      <Text
        style={[styles.price, { fontSize, lineHeight: fontSize + 6 }]}
        maxFontSizeMultiplier={theme.maxFontSizeMultiplier}
      >
        {formatInr(price)}
      </Text>
      {showMrp ? (
        <Text
          testID="price-mrp"
          style={styles.mrp}
          maxFontSizeMultiplier={theme.maxFontSizeMultiplier}
        >
          {formatInr(mrp)}
        </Text>
      ) : null}
      <DiscountBadge pct={pct} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.sm },
  price: { color: theme.colors.price, fontWeight: '700' },
  mrp: {
    ...theme.typography.body,
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
});
