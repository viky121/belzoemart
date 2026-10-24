import { discountPct, type Money, type ProductCardDto } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useProducts } from '@/features/products/hooks';
import { useCardCart } from '@/features/cart/use-card-cart';
import { useCardWishlist } from '@/features/wishlist/use-card-wishlist';
import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { EmptyState, ErrorState, ProductCard, Screen } from '@/ui';
import { IconButton } from '@/ui/IconButton';
import { ProductGridSkeleton } from '@/ui/Skeleton';

type Nav = NavigationProp<RootStackParamList>;

/** Offers tab: biggest discounts first, 2-column grid with infinite scroll. */
export function OffersScreen() {
  const navigation = useNavigation<Nav>();
  const list = useProducts({ sort: 'discount' });
  const heart = useCardWishlist();
  const cardCart = useCardCart();
  const brand = useBrand();
  const products = useMemo(
    () => (list.data?.pages.flatMap((p) => p.items) ?? []).filter((p) => (p.mrp ?? 0) > p.sellingPrice),
    [list.data],
  );

  // Biggest discount among the loaded offers, shown as a headline chip.
  const topPct = products.reduce(
    (max, p) => Math.max(max, p.mrp != null ? discountPct(p.mrp as Money, p.sellingPrice as Money) : 0),
    0,
  );

  const open = (p: ProductCardDto) => navigation.navigate('ProductDetail', { idOrSlug: p.slug });

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headText}>
          <Text style={styles.title} accessibilityRole="header">
            Offers
          </Text>
          <Text style={styles.sub}>Best deals on your everyday essentials</Text>
          {topPct > 0 ? (
            <View style={[styles.topChip, { backgroundColor: brand.primaryBg }]}>
              <MaterialCommunityIcons name="tag-heart-outline" size={14} color={brand.primary} />
              <Text style={[styles.topChipText, { color: brand.primary }]}>Up to {topPct}% OFF</Text>
            </View>
          ) : null}
        </View>
        <IconButton icon="magnify" label="Search" onPress={() => navigation.navigate('Search')} />
      </View>

      {list.isLoading ? (
        <ProductGridSkeleton count={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : products.length === 0 ? (
        <EmptyState icon="tag-outline" title="No offers right now" body="Check back soon for new deals." />
      ) : (
        <FlashList
          data={products}
          numColumns={2}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.grid}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <ProductCard
                product={item}
                onPress={() => open(item)}
                wishlisted={heart.isWishlisted(item)}
                onToggleWishlist={() => heart.onToggle(item)}
                {...cardCart.cardProps(item)}
              />
            </View>
          )}
          ListFooterComponent={
            list.isFetchingNextPage ? (
              <ActivityIndicator style={styles.footer} color={theme.colors.primaryStrong} />
            ) : null
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  headText: { flex: 1, alignItems: 'flex-start', gap: 1 },
  topChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  topChipText: { fontSize: 12, lineHeight: 16, fontWeight: '800' },
  title: { ...theme.typography.heading, color: theme.colors.inkStrong },
  sub: { ...theme.typography.caption, color: theme.colors.muted },
  grid: { padding: theme.spacing.sm, paddingBottom: 96 },
  cell: { flex: 1, padding: theme.spacing.xs },
  footer: { paddingVertical: theme.spacing.lg },
});
