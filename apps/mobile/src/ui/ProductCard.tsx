import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ProductCardDto } from '@belzo/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';

import { Button } from './Button';
import { priceA11yLabel, PriceDisplay } from './PriceDisplay';
import { RemoteImage } from './RemoteImage';

export interface ProductCardProps {
  product: ProductCardDto;
  onPress: () => void;
  /** Add-to-cart; the button is hidden when the product has no defaultVariantId. */
  onAdd?: () => void;
  adding?: boolean;
  compact?: boolean;
  /** Wishlist heart (top-right). Hidden when no handler is provided. */
  onToggleWishlist?: () => void;
  wishlisted?: boolean;
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
  onToggleWishlist,
  wishlisted = false,
}: ProductCardProps) {
  const canAdd = Boolean(onAdd && product.defaultVariantId);
  const imageSize = compact ? 120 : 150;
  return (
    <View style={[styles.card, compact && styles.compact]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={productCardA11yLabel(product)}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <View style={styles.imageWrap}>
          <RemoteImage
            uri={product.imageUrl}
            width="100%"
            height={imageSize}
            contentFit="contain"
            fallbackLabel={product.title}
            radius={theme.radius.md}
          />
          {onToggleWishlist ? (
            <Pressable
              onPress={onToggleWishlist}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
              accessibilityState={{ selected: wishlisted }}
              style={styles.heart}
            >
              <MaterialCommunityIcons
                name={wishlisted ? 'heart' : 'heart-outline'}
                size={18}
                color={wishlisted ? theme.colors.danger : theme.colors.ink}
              />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {product.title}
        </Text>
        {product.unit ? <Text style={styles.unit}>{product.unit}</Text> : null}
        <PriceDisplay price={product.sellingPrice} mrp={product.mrp} size="sm" />
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
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border2,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  compact: { width: 160, flex: 0 },
  pressed: { opacity: 0.85 },
  imageWrap: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    position: 'relative',
  },
  heart: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...theme.typography.body,
    color: theme.colors.inkStrong,
    fontWeight: '600',
    marginTop: theme.spacing.xs,
  },
  unit: { ...theme.typography.caption, color: theme.colors.muted },
  add: { marginTop: theme.spacing.xs },
});
