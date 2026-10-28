import { MaterialCommunityIcons } from '@expo/vector-icons';
import { discountPct, formatInr, type Money } from '@belzo/shared';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { DiscountBadge } from './DiscountBadge';
import { priceA11yLabel } from './PriceDisplay';
import { productCardA11yLabel, type ProductCardProps } from './ProductCard';
import { QtyValue } from './QtyValue';
import { RemoteImage } from './RemoteImage';

const IMAGE_H = 92;
const CTRL_H = 30;
const SLOP = { top: 6, bottom: 6, left: 6, right: 6 } as const;
/** The text may grow with the phone's font, but only a little, so a narrow card never cuts it. */
const MAX_SCALE = 1.15;

/**
 * Product card for a row of THREE (about 100 dp wide). Nothing is cut: the title takes up to three
 * lines, the price and the struck old price wrap onto a second line when they do not fit side by
 * side, the offer sits on the picture as a small badge, and Add is a full-width button below.
 */
export function DenseProductCard({
  product,
  onPress,
  onAdd,
  adding = false,
  quantity = 0,
  onChangeQuantity,
  onToggleWishlist,
  wishlisted = false,
}: ProductCardProps) {
  const brand = useBrand();
  const showMrp = product.mrp != null && product.mrp > product.sellingPrice;
  const offPct = showMrp ? discountPct(product.mrp as Money, product.sellingPrice as Money) : 0;
  const canAdd = Boolean(onAdd && product.defaultVariantId);
  const showStepper = canAdd && quantity > 0 && Boolean(onChangeQuantity);
  return (
    <View style={styles.card} testID="dense-product-card">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={productCardA11yLabel(product)}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        <View style={styles.imageWrap}>
          <RemoteImage
            uri={product.imageUrl}
            width="100%"
            height={IMAGE_H}
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
                size={15}
                color={wishlisted ? theme.colors.danger : theme.colors.ink}
              />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={3} maxFontSizeMultiplier={MAX_SCALE}>
          {product.title}
        </Text>
        {product.unit ? (
          <Text style={styles.unit} numberOfLines={2} maxFontSizeMultiplier={MAX_SCALE}>
            {product.unit}
          </Text>
        ) : null}
        <View
          style={styles.prices}
          accessible
          accessibilityRole="text"
          accessibilityLabel={priceA11yLabel(product.sellingPrice, product.mrp)}
        >
          <Text style={styles.price} maxFontSizeMultiplier={MAX_SCALE}>
            {formatInr(product.sellingPrice)}
          </Text>
          {showMrp ? (
            <Text testID="price-mrp" style={styles.mrp} maxFontSizeMultiplier={MAX_SCALE}>
              {formatInr(product.mrp as number)}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {canAdd ? (
        showStepper ? (
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
              <MaterialCommunityIcons name={quantity <= 1 ? 'trash-can-outline' : 'minus'} size={15} color={theme.colors.white} />
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
                width={26}
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
              <MaterialCommunityIcons name="plus" size={15} color={theme.colors.white} />
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
            style={({ pressed }) => [styles.addBtn, { borderColor: brand.primary }, pressed && { backgroundColor: brand.primaryBg }]}
            testID="product-card-add"
          >
            {adding ? (
              <ActivityIndicator size="small" color={brand.primary} />
            ) : (
              <Text style={[styles.addText, { color: brand.primary }]} maxFontSizeMultiplier={MAX_SCALE}>
                ADD
              </Text>
            )}
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: 6,
    gap: 6,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  body: { flexGrow: 1, gap: 3 },
  pressed: { opacity: 0.88 },
  imageWrap: {
    backgroundColor: '#f6f8fa',
    borderRadius: theme.radius.md,
    padding: 4,
    position: 'relative',
  },
  heart: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Always room for three lines, so cards in a row are the same height and the Add buttons line up.
  title: {
    fontSize: 11.5,
    lineHeight: 15,
    minHeight: 45,
    color: theme.colors.inkStrong,
    fontWeight: '600',
    marginTop: 2,
  },
  // Explicit weight: without it Android can clip the last character of regular text.
  unit: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '400',
    color: theme.colors.muted,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  prices: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 5, rowGap: 0, marginTop: 1 },
  price: { fontSize: 13.5, lineHeight: 18, fontWeight: '700', color: theme.colors.price },
  mrp: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  addBtn: {
    height: CTRL_H,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    backgroundColor: theme.colors.surface,
  },
  addText: { fontSize: 12.5, lineHeight: 16, fontWeight: '800' },
  stepper: {
    height: CTRL_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radius.md,
  },
  stepBtn: { flex: 1, height: CTRL_H, alignItems: 'center', justifyContent: 'center' },
  qtyBox: { flex: 1.1, alignItems: 'center', justifyContent: 'center' },
});
