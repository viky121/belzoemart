import { MaterialCommunityIcons } from '@expo/vector-icons';
import { discountPct, type Money, type ProductCardDto } from '@belzo/shared';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';

import { DiscountBadge } from './DiscountBadge';
import { priceA11yLabel, PriceDisplay } from './PriceDisplay';
import { QtyValue } from './QtyValue';
import { RemoteImage } from './RemoteImage';

export interface ProductCardProps {
  product: ProductCardDto;
  onPress: () => void;
  /** Add-to-cart; the control is hidden when the product has no defaultVariantId. */
  onAdd?: () => void;
  adding?: boolean;
  /** Units of this product already in the cart; > 0 swaps the Add button for a stepper. */
  quantity?: number;
  /** Stepper handler (0 = remove). Without it the Add button is shown even when quantity > 0. */
  onChangeQuantity?: (next: number) => void;
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

const CARD_PAD = theme.spacing.sm;
const IMAGE_PAD = theme.spacing.sm;
const CART_CTRL_H = 34;
const CART_CTRL_INSET = 6;
const SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

export function ProductCard({
  product,
  onPress,
  onAdd,
  adding = false,
  quantity = 0,
  onChangeQuantity,
  compact = false,
  onToggleWishlist,
  wishlisted = false,
}: ProductCardProps) {
  const offPct =
    product.mrp != null && product.mrp > product.sellingPrice
      ? discountPct(product.mrp as Money, product.sellingPrice as Money)
      : 0;
  const brand = useBrand();
  const canAdd = Boolean(onAdd && product.defaultVariantId);
  const showStepper = canAdd && quantity > 0 && Boolean(onChangeQuantity);
  const imageSize = compact ? 120 : 150;
  // The cart control floats over the bottom-right corner of the image block.
  const controlTop = CARD_PAD + imageSize + IMAGE_PAD * 2 - CART_CTRL_H - CART_CTRL_INSET;
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
          <DiscountBadge variant="corner" pct={offPct} />
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
        <PriceDisplay price={product.sellingPrice} mrp={product.mrp} size="sm" hideBadge />
      </Pressable>

      {canAdd ? (
        <View style={[styles.control, { top: controlTop }]} pointerEvents="box-none">
          {showStepper ? (
            <View
              style={[styles.stepper, { backgroundColor: brand.primary }]}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={`${product.title} quantity`}
              accessibilityValue={{ now: quantity, text: String(quantity) }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'increment') onChangeQuantity!(quantity + 1);
                if (e.nativeEvent.actionName === 'decrement') onChangeQuantity!(quantity - 1);
              }}
              testID="product-card-stepper"
            >
              <Pressable
                onPress={() => onChangeQuantity!(quantity - 1)}
                disabled={adding}
                hitSlop={SLOP}
                style={styles.stepBtn}
                accessibilityRole="button"
                accessibilityLabel={`Decrease ${product.title}`}
                testID="product-card-dec"
              >
                <MaterialCommunityIcons
                  name={quantity <= 1 ? 'trash-can-outline' : 'minus'}
                  size={16}
                  color={theme.colors.white}
                />
              </Pressable>
              <View style={styles.qtyBox}>
                <QtyValue
                  value={quantity}
                  onCommit={onChangeQuantity!}
                  min={0}
                  max={99}
                  busy={adding}
                  label={product.title}
                  color={theme.colors.white}
                  width={34}
                />
              </View>
              <Pressable
                onPress={() => onChangeQuantity!(quantity + 1)}
                disabled={adding || quantity >= 99}
                hitSlop={SLOP}
                style={styles.stepBtn}
                accessibilityRole="button"
                accessibilityLabel={`Increase ${product.title}`}
                testID="product-card-inc"
              >
                <MaterialCommunityIcons name="plus" size={16} color={theme.colors.white} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={onAdd}
              disabled={adding}
              hitSlop={SLOP}
              accessibilityRole="button"
              accessibilityLabel={`Add ${product.title} to cart`}
              accessibilityState={{ busy: adding, disabled: adding }}
              style={({ pressed }) => [
                styles.addBtn,
                { borderColor: brand.primary },
                pressed && { backgroundColor: brand.primaryBg },
              ]}
              testID="product-card-add"
            >
              {adding ? (
                <ActivityIndicator size="small" color={brand.primary} />
              ) : (
                <>
                  <MaterialCommunityIcons name="cart-plus" size={16} color={brand.primary} />
                  <Text
                    style={[styles.addText, { color: brand.primary }]}
                    maxFontSizeMultiplier={theme.maxFontSizeMultiplier}
                  >
                    ADD
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: CARD_PAD,
    gap: 3,
    shadowColor: '#0f172a',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  compact: { width: 160, flex: 0 },
  pressed: { opacity: 0.88 },
  imageWrap: {
    backgroundColor: '#f6f8fa',
    borderRadius: theme.radius.lg,
    padding: IMAGE_PAD,
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
    fontSize: 13,
    lineHeight: 18,
    minHeight: 36,
    color: theme.colors.inkStrong,
    fontWeight: '600',
    marginTop: theme.spacing.xs,
  },
  unit: {
    ...theme.typography.caption,
    fontSize: 11.5,
    lineHeight: 15,
    color: theme.colors.muted,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  control: {
    position: 'absolute',
    right: CARD_PAD + CART_CTRL_INSET,
    height: CART_CTRL_H,
    alignItems: 'flex-end',
  },
  addBtn: {
    height: CART_CTRL_H,
    minWidth: 68,
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.primaryStrong,
    backgroundColor: theme.colors.surface,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  addPressed: { backgroundColor: theme.colors.primaryBg },
  addText: { fontSize: 13, lineHeight: 18, fontWeight: '800', color: theme.colors.primaryStrong },
  stepper: {
    height: CART_CTRL_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primaryStrong,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stepBtn: { width: 30, height: CART_CTRL_H, alignItems: 'center', justifyContent: 'center' },
  qtyBox: { minWidth: 34, alignItems: 'center' },
});
