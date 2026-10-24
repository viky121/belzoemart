import {
  effectiveOrderLimits,
  formatInr,
  limitsWithOffer,
  offerForVariant,
  productOfferBanner,
  resolveSlabPrice,
  type ProductCardDto,
} from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '@/lib/use-bottom-inset';

import { isApiError } from '@/api/errors';
import { env } from '@/config/env';
import { useActiveOffers, useAddToCart } from '@/features/cart/hooks';
import { useToggleWishlist, useWishlist } from '@/features/wishlist/hooks';
import { requireAuth } from '@/navigation/RequireAuth';
import type { RootScreenProps } from '@/navigation/types';
import { useRecentlyViewedStore } from '@/store/recently-viewed';
import { useSessionStore } from '@/store/session';
import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PriceDisplay,
  QuantitySelector,
  Rating,
  Screen,
} from '@/ui';
import { ProductRail } from '@/ui/ProductRail';
import { DetailSkeleton } from '@/ui/Skeleton';

import { DeliveryCheck } from '../components/DeliveryCheck';
import { Gallery } from '../components/Gallery';
import { ReviewsList } from '../components/ReviewsList';
import { SlabTable } from '../components/SlabTable';
import { VariantPicker } from '../components/VariantPicker';
import { useProduct, useRelated, useReviews } from '../hooks';

/** Card heading with a small brand-coloured bar, matching the Home section headers. */
function CardTitle({ title }: { title: string }) {
  const brand = useBrand();
  return (
    <View style={styles.cardTitleRow}>
      <View style={[styles.cardTitleBar, { backgroundColor: brand.active ? brand.accent : brand.primary }]} />
      <Text style={styles.heading} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/** Product detail (design §11): gallery, variants, slab price, delivery, reviews, related, Add/Buy. */
export function ProductDetailScreen({ navigation, route }: RootScreenProps<'ProductDetail'>) {
  const { idOrSlug } = route.params;
  const insets = useInsets();
  const brand = useBrand();

  const product = useProduct(idOrSlug);
  const reviews = useReviews(product.data?.id);
  const related = useRelated(product.data?.categoryId);
  const add = useAddToCart();
  const isCustomer = useSessionStore((s) => s.status === 'authenticated');
  const wishlist = useWishlist();
  const activeOffers = useActiveOffers();
  const toggleWishlist = useToggleWishlist();
  const pushRecent = useRecentlyViewedStore((s) => s.push);

  const [selectedId, setSelectedId] = useState('');
  const [qty, setQty] = useState(1);
  // The "added to cart" confirmation is derived: it only shows for the exact
  // variant+quantity that was added, so changing either clears it automatically.
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);

  const p = product.data;
  useEffect(() => {
    if (p?.id) pushRecent(p.id);
  }, [p?.id, pushRecent]);

  const backBtn = (
    <Pressable
      onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={[styles.floatBtn, { top: insets.top + 8, left: theme.spacing.md }]}
    >
      <MaterialCommunityIcons name="chevron-left" size={26} color={theme.colors.inkStrong} />
    </Pressable>
  );

  if (product.isLoading) {
    return (
      <Screen>
        <DetailSkeleton />
        {backBtn}
      </Screen>
    );
  }
  if (product.isError || !p) {
    const notFound = isApiError(product.error) && product.error.status === 404;
    return (
      <Screen>
        {backBtn}
        {notFound ? (
          <EmptyState icon="package-variant" title="This product is no longer available" />
        ) : (
          <ErrorState error={product.error} onRetry={() => void product.refetch()} />
        )}
      </Screen>
    );
  }

  const variants = p.variants;
  const variant = variants.find((v) => v.id === selectedId) ?? variants.find((v) => v.inStock) ?? variants[0];
  // While a special-price offer is on, the pack is limited to its units per order (the server enforces it too).
  const offer = offerForVariant(activeOffers.data ?? [], variant?.id);
  const limits = limitsWithOffer(effectiveOrderLimits({ minOrderQty: variant?.minQty, maxOrderQty: variant?.maxQty }), offer);
  const price = variant ? resolveSlabPrice(variant.sellingPrice, variant.priceSlabs, qty) : p.sellingPrice;
  const mrp = variant?.mrp ?? p.mrp;
  const saving = mrp != null && mrp > price ? mrp - price : 0;
  const inStock = variant?.inStock ?? false;
  const added = confirmedKey !== null && confirmedKey === `${variant?.id ?? ''}:${qty}`;

  const images = Array.from(
    new Set([variant?.imageUrl, ...p.images.map((i) => i.url)].filter((u): u is string => Boolean(u))),
  );
  const isWishlisted = Boolean(variant && wishlist.data?.some((w) => w.variantId === variant.id));
  const relatedProducts = (related.data ?? []).filter((rp) => rp.id !== p.id);

  function onHeart() {
    if (!variant) return;
    if (!isCustomer) {
      navigation.navigate('Login', { redirect: { name: 'ProductDetail', params: { idOrSlug } } });
      return;
    }
    toggleWishlist.mutate({ variantId: variant.id, wishlisted: isWishlisted });
  }

  function onAdd() {
    if (variant)
      add.mutate(
        { variantId: variant.id, quantity: qty },
        { onSuccess: () => setConfirmedKey(`${variant.id}:${qty}`) },
      );
  }
  function onBuyNow() {
    if (!variant) return;
    add.mutate(
      { variantId: variant.id, quantity: qty },
      { onSuccess: () => requireAuth(navigation, { name: 'Checkout' }) },
    );
  }

  const attrs = Object.entries(p.attributes ?? {});
  // A solid bar under the status bar: the page scrolls beneath it, never behind the clock and battery icons.
  const topBar = (
    <View style={[styles.topBar, { paddingTop: insets.top }]} testID="pdp-topbar">
      <View style={styles.topBarRow}>
        <Pressable
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.barBtn}
          hitSlop={6}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.inkStrong} />
        </Pressable>
        <Text style={styles.barTitle} numberOfLines={1} accessibilityRole="header">
          {p.title}
        </Text>
        <Pressable
          onPress={onHeart}
          accessibilityRole="button"
          accessibilityLabel={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          style={styles.barBtn}
          hitSlop={6}
        >
          <MaterialCommunityIcons
            name={isWishlisted ? 'heart' : 'heart-outline'}
            size={23}
            color={isWishlisted ? theme.colors.danger : theme.colors.inkStrong}
          />
        </Pressable>
        <Pressable
          onPress={() =>
            void Share.share({ message: `${p.title} — ${env.apiBaseUrl}/product/${p.slug}` })
          }
          accessibilityRole="button"
          accessibilityLabel="Share product"
          style={styles.barBtn}
          hitSlop={6}
        >
          <MaterialCommunityIcons name="share-variant-outline" size={22} color={theme.colors.inkStrong} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {topBar}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Gallery
          images={images}
          fallbackLabel={p.title}
          onOpenImage={(i) => navigation.navigate('ImageViewer', { images, index: i })}
        />

        <Card>
          {p.brand ? <Text style={[styles.brand, { color: brand.primary }]}>{p.brand}</Text> : null}
          <Text style={styles.title}>{p.title}</Text>
          <Rating value={p.ratingAvg} count={p.ratingCount} />

          <View style={styles.divider} />
          <PriceDisplay price={price} mrp={mrp} size="lg" />
          {saving > 0 ? (
            <Text style={[styles.saving, { color: brand.primary }]}>You save {formatInr(saving)} on this pack</Text>
          ) : null}
          <View
            style={[
              styles.stockChip,
              { backgroundColor: inStock ? theme.colors.successBg : theme.colors.dangerBg },
            ]}
          >
            <View
              style={[
                styles.stockDot,
                { backgroundColor: inStock ? theme.colors.brandStrong : theme.colors.danger },
              ]}
            />
            <Text style={[styles.stock, { color: inStock ? theme.colors.brandStrong : theme.colors.danger }]}>
              {inStock ? 'In stock' : 'Out of stock'}
            </Text>
          </View>
        </Card>

        {variants.length > 1 ? (
          <Card>
            <VariantPicker variants={variants} selectedId={variant?.id ?? ''} onSelect={setSelectedId} />
          </Card>
        ) : null}

        {variant && variant.priceSlabs.length > 0 ? (
          <Card>
            <SlabTable slabs={variant.priceSlabs} />
          </Card>
        ) : null}

        {offer ? (
          <Card>
            <View style={styles.offerBox} testID="pdp-offer">
              <Text style={styles.offerHead}>🎁 {productOfferBanner(offer).headline}</Text>
              <Text style={styles.offerNote}>{productOfferBanner(offer).note}</Text>
            </View>
          </Card>
        ) : null}
        <Card>
          <View style={styles.qtyRow}>
            <Text style={styles.qtyLabel}>Quantity</Text>
            <QuantitySelector value={Math.min(qty, limits.max)} onChange={setQty} min={1} max={limits.max} disabled={!inStock} label={p.title} />
          </View>
          <View style={styles.divider} />
          <DeliveryCheck />
        </Card>

        {p.description ? (
          <Card>
            <CardTitle title="Description" />
            <Text style={styles.body2}>{p.description}</Text>
          </Card>
        ) : null}

        {attrs.length > 0 ? (
          <Card>
            <CardTitle title="Details" />
            {attrs.map(([k, v], i) => (
              <View key={k} style={[styles.attrRow, i === attrs.length - 1 && styles.attrLast]}>
                <Text style={styles.attrKey}>{k}</Text>
                <Text style={styles.attrVal}>{v}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {p.shgName || p.story ? (
          <Card>
            <CardTitle title={p.shgName ? `Made by ${p.shgName}` : 'Our story'} />
            {p.story ? <Text style={styles.body2}>{p.story}</Text> : null}
          </Card>
        ) : null}

        {p.isReturnable === false ? (
          <Text style={styles.notReturnable}>This product is not returnable.</Text>
        ) : null}

        <ReviewsList reviews={reviews.data ?? []} />

        {relatedProducts.length > 0 ? (
          <ProductRail
            title="You may also like"
            products={relatedProducts}
            onPressProduct={(rp: ProductCardDto) => navigation.push('ProductDetail', { idOrSlug: rp.slug })}
          />
        ) : null}
      </ScrollView>

      {added ? (
        <Pressable
          style={[styles.addedBar, { backgroundColor: brand.primary }]}
          onPress={() => navigation.navigate('Cart')}
          accessibilityRole="button"
          accessibilityLabel="Added to cart. View cart"
        >
          <MaterialCommunityIcons name="check-circle" size={18} color={theme.colors.white} />
          <Text style={styles.addedText}>Added to cart</Text>
          <Text style={styles.addedLink}>VIEW CART ›</Text>
        </Pressable>
      ) : null}
      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
        <Button
          title={added ? 'Add more' : 'Add to Cart'}
          variant={added ? 'secondary' : 'primary'}
          style={styles.footerBtn}
          disabled={!inStock}
          loading={add.isPending}
          onPress={onAdd}
          testID="pdp-add"
        />
        <Button
          title={added ? 'Go to Cart' : 'Buy Now'}
          variant={added ? 'primary' : 'secondary'}
          style={styles.footerBtn}
          disabled={!inStock && !added}
          onPress={added ? () => navigation.navigate('Cart') : onBuyNow}
          testID="pdp-buy"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { paddingBottom: theme.spacing.xl },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: theme.colors.inkStrong },
  brand: { fontSize: 12, lineHeight: 16, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, marginVertical: theme.spacing.md },
  saving: { ...theme.typography.body, fontWeight: '700', marginTop: theme.spacing.xs },
  stockChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
  },
  stockDot: { width: 7, height: 7, borderRadius: 4 },
  stock: { fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
  floatBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  floatRight: {
    position: 'absolute',
    right: theme.spacing.md,
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  topBar: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    zIndex: 5,
  },
  topBarRow: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.xs },
  barBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, ...theme.typography.bodyLg, color: theme.colors.inkStrong, fontWeight: '700', paddingHorizontal: theme.spacing.xs },
  floatBtnStatic: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  offerBox: { gap: 2, padding: theme.spacing.sm, borderRadius: theme.radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  offerHead: { ...theme.typography.body, color: '#92400e', fontWeight: '800' },
  offerNote: { ...theme.typography.caption, color: '#b45309' },
  qtyLabel: { ...theme.typography.bodyLg, color: theme.colors.inkStrong, fontWeight: '700' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  cardTitleBar: { width: 4, height: 16, borderRadius: 2 },
  heading: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: theme.colors.inkStrong },
  body2: { ...theme.typography.body, color: theme.colors.ink, lineHeight: 22 },
  attrRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  attrLast: { borderBottomWidth: 0 },
  attrKey: { ...theme.typography.body, color: theme.colors.muted, textTransform: 'capitalize' },
  attrVal: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  notReturnable: {
    ...theme.typography.caption,
    color: theme.colors.danger,
    marginTop: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
  },
  // Two buttons side by side, lifted off the page with a soft upward shadow.
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 14,
  },
  footerBtn: { flex: 1, minHeight: 50 },
  addedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  addedText: { ...theme.typography.body, color: theme.colors.white, fontWeight: '700', flex: 1 },
  addedLink: { ...theme.typography.body, color: theme.colors.white, fontWeight: '800' },
});
