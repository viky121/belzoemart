import type { ProductCardDto } from '@belzo/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

import { Button } from './Button';
import { priceA11yLabel, PriceDisplay } from './PriceDisplay';
import { Rating } from './Rating';
import { RemoteImage } from './RemoteImage';

export interface ProductCardProps {
  product: ProductCardDto;
  onPress: () => void;
  /** Add-to-cart; the button is hidden when the product has no defaultVariantId. */
  onAdd?: () => void;
  adding?: boolean;
  compact?: boolean;
}

export function productCardA11yLabel(p: ProductCardDto): string {
  return [p.title, p.unit ?? null, priceA11yLabel(p.sellingPrice, p.mrp)]
    .filter(Boolean)
    .join(', ');
}

export function ProductCard({
  product,
  onPress,
  onAdd,
  adding = false,
  compact = false,
}: ProductCardProps) {
  const canAdd = Boolean(onAdd && product.defaultVariantId);
  const imageSize = compact ? 120 : 160;
  return (
    <View style={[styles.card, compact && styles.compact]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={productCardA11yLabel(product)}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <RemoteImage
          uri={product.imageUrl}
          width="100%"
          height={imageSize}
          contentFit="contain"
          fallbackLabel={product.title}
          radius={theme.radius.md}
        />
        <Text style={styles.title} numberOfLines={2}>
          {product.title}
        </Text>
        {product.unit ? <Text style={styles.unit}>{product.unit}</Text> : null}
        <PriceDisplay price={product.sellingPrice} mrp={product.mrp} size="sm" />
        <Rating value={product.ratingAvg} count={product.ratingCount} />
      </Pressable>
      {canAdd ? (
        <Button
          title="Add"
          variant="secondary"
          icon="cart-plus"
          loading={adding}
          onPress={onAdd!}
          accessibilityLabel={`Add ${product.title} to cart`}
          style={styles.add}
          testID="product-card-add"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border2,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  compact: { width: 160, flex: 0 },
  pressed: { opacity: 0.85 },
  title: { ...theme.typography.body, color: theme.colors.ink, marginTop: theme.spacing.xs },
  unit: { ...theme.typography.caption, color: theme.colors.muted },
  add: { marginTop: theme.spacing.xs },
});
