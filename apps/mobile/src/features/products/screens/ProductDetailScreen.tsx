import { resolveSlabPrice, type ProductCardDto } from '@belzo/shared';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiError } from '@/api/errors';
import { useAddToCart } from '@/features/cart/hooks';
import { useToggleWishlist, useWishlist } from '@/features/wishlist/hooks';
import { requireAuth } from '@/navigation/RequireAuth';
import type { RootScreenProps } from '@/navigation/types';
import { useRecentlyViewedStore } from '@/store/recently-viewed';
import { useSessionStore } from '@/store/session';
import { theme } from '@/theme';
import { Button, EmptyState, ErrorState, IconButton, PriceDisplay, QuantitySelector, Rating, Screen } from '@/ui';
import { ProductRail } from '@/ui/ProductRail';
import { DetailSkeleton } from '@/ui/Skeleton';

import { DeliveryCheck } from '../components/DeliveryCheck';
import { Gallery } from '../components/Gallery';
import { ReviewsList } from '../components/ReviewsList';
import { SlabTable } from '../components/SlabTable';
import { VariantPicker } from '../components/VariantPicker';
import { useProduct, useRelated, useReviews } from '../hooks';

/** Product detail (design §11): gallery, variants, slab price, delivery, reviews, related, Add/Buy. */
export function ProductDetailScreen({ navigation, route }: RootScreenProps<'ProductDetail'>) {
  const { idOrSlug } = route.params;
  const insets = useSafeAreaInsets();

  const product = useProduct(idOrSlug);
  const reviews = useReviews(product.data?.id);
  const related = useRelated(product.data?.categoryId);
  const add = useAddToCart();
  const isCustomer = useSessionStore((s) => s.status === 'authenticated');
  const wishlist = useWishlist();
  const toggleWishlist = useToggleWishlist();
  const pushRecent = useRecentlyViewedStore((s) => s.push);

  const [selectedId, setSelectedId] = useState('');
  const [qty, setQty] = useState(1);

  const p = product.data;
  useEffect(() => {
    if (p?.id) pushRecent(p.id);
  }, [p?.id, pushRecent]);

  useLayoutEffect(() => {
    if (p?.title) navigation.setOptions({ title: p.title });
  }, [navigation, p?.title]);

  if (product.isLoading) {
    return (
      <Screen>
        <DetailSkeleton />
      </Screen>
    );
  }
  if (product.isError || !p) {
    const notFound = isApiError(product.error) && product.error.status === 404;
    return (
      <Screen>
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
  const price = variant ? resolveSlabPrice(variant.sellingPrice, variant.priceSlabs, qty) : p.sellingPrice;
  const inStock = variant?.inStock ?? false;

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
    if (variant) add.mutate({ variantId: variant.id, quantity: qty });
  }
  function onBuyNow() {
    if (!variant) return;
    add.mutate(
      { variantId: variant.id, quantity: qty },
      { onSuccess: () => requireAuth(navigation, { name: 'Checkout' }) },
    );
  }

  const attrs = Object.entries(p.attributes ?? {});

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Gallery images={images} fallbackLabel={p.title} onOpenImage={(i) => navigation.navigate('ImageViewer', { images, index: i })} />

        <View style={styles.section}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{p.title}</Text>
            <IconButton
              icon={isWishlisted ? 'heart' : 'heart-outline'}
              label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
              color={isWishlisted ? theme.colors.danger : theme.colors.ink}
              onPress={onHeart}
            />
          </View>
          {p.brand ? <Text style={styles.brand}>{p.brand}</Text> : null}
          <Rating value={p.ratingAvg} count={p.ratingCount} />

          {variants.length > 1 ? (
            <View style={styles.block}>
              <VariantPicker variants={variants} selectedId={variant?.id ?? ''} onSelect={setSelectedId} />
            </View>
          ) : null}

          <View style={styles.block}>
            <PriceDisplay price={price} mrp={variant?.mrp ?? p.mrp} size="lg" />
            <Text style={[styles.stock, { color: inStock ? theme.colors.brandStrong : theme.colors.danger }]}>
              {inStock ? 'In stock' : 'Out of stock'}
            </Text>
          </View>

          {variant && variant.priceSlabs.length > 0 ? (
            <View style={styles.block}>
              <SlabTable slabs={variant.priceSlabs} />
            </View>
          ) : null}

          <View style={[styles.block, styles.qtyRow]}>
            <Text style={styles.qtyLabel}>Quantity</Text>
            <QuantitySelector value={qty} onChange={setQty} min={1} max={99} disabled={!inStock} label={p.title} />
          </View>

          <View style={styles.block}>
            <DeliveryCheck />
          </View>

          {p.description ? (
            <View style={styles.block}>
              <Text style={styles.heading}>Description</Text>
              <Text style={styles.body2}>{p.description}</Text>
            </View>
          ) : null}

          {attrs.length > 0 ? (
            <View style={styles.block}>
              <Text style={styles.heading}>Details</Text>
              {attrs.map(([k, v]) => (
                <View key={k} style={styles.attrRow}>
                  <Text style={styles.attrKey}>{k}</Text>
                  <Text style={styles.attrVal}>{v}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {p.shgName || p.story ? (
            <View style={styles.block}>
              <Text style={styles.heading}>{p.shgName ? `Made by ${p.shgName}` : 'Our story'}</Text>
              {p.story ? <Text style={styles.body2}>{p.story}</Text> : null}
            </View>
          ) : null}

          {p.isReturnable === false ? (
            <Text style={styles.notReturnable}>This product is not returnable.</Text>
          ) : null}
        </View>

        <ReviewsList reviews={reviews.data ?? []} />

        {relatedProducts.length > 0 ? (
          <ProductRail
            title="You may also like"
            products={relatedProducts}
            onPressProduct={(rp: ProductCardDto) => navigation.push('ProductDetail', { idOrSlug: rp.slug })}
          />
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
        <Button title="Add to cart" variant="primary" style={styles.footerBtn} disabled={!inStock} loading={add.isPending} onPress={onAdd} testID="pdp-add" />
        <Button title="Buy now" variant="accent" style={styles.footerBtn} disabled={!inStock} onPress={onBuyNow} testID="pdp-buy" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: { paddingBottom: theme.spacing.xl },
  section: { padding: theme.spacing.lg, gap: theme.spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.sm },
  title: { ...theme.typography.heading, color: theme.colors.inkStrong, flex: 1 },
  brand: { ...theme.typography.body, color: theme.colors.muted },
  block: { marginTop: theme.spacing.md, gap: theme.spacing.sm },
  stock: { ...theme.typography.body, fontWeight: '700' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyLabel: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '600' },
  heading: { ...theme.typography.title, color: theme.colors.inkStrong },
  body2: { ...theme.typography.body, color: theme.colors.ink, lineHeight: 22 },
  attrRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  attrKey: { ...theme.typography.body, color: theme.colors.muted, textTransform: 'capitalize' },
  attrVal: { ...theme.typography.body, color: theme.colors.ink, flexShrink: 1, textAlign: 'right' },
  notReturnable: { ...theme.typography.caption, color: theme.colors.danger, marginTop: theme.spacing.md },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  footerBtn: { flex: 1 },
});
