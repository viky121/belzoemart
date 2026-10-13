import type { ProductCardDto, ProductSort } from '@belzo/shared';
import { FlashList } from '@shopify/flash-list';
import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAddToCart } from '@/features/cart/hooks';
import { useCategories } from '@/features/categories/hooks';
import { findBySlug } from '@/features/categories/tree';
import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { Button, Chip, EmptyState, ErrorState, ProductCard, Screen } from '@/ui';
import { ProductGridSkeleton } from '@/ui/Skeleton';
import { Sheet } from '@/ui/Sheet';

import { useBrands, useProducts } from '../hooks';

const SORTS: { key: ProductSort; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'popularity', label: 'Popularity' },
  { key: 'newest', label: 'Newest' },
  { key: 'rating', label: 'Rating' },
  { key: 'discount', label: 'Discount' },
  { key: 'price_asc', label: 'Price: Low to High' },
  { key: 'price_desc', label: 'Price: High to Low' },
];
const PAGE_LOCAL_SORTS = new Set<ProductSort>(['price_asc', 'price_desc', 'discount']);

/** Product list (design §11): sort/filter sheets, 2-column FlashList, infinite scroll. */
export function ProductListScreen({ navigation, route }: RootScreenProps<'ProductList'>) {
  const params = route.params ?? {};
  const categories = useCategories();

  // Resolve a slug-only category against the cached tree (design §2.6).
  const resolvedCategoryId = useMemo(() => {
    if (params.categoryId) return params.categoryId;
    if (params.categorySlug && categories.data) {
      return findBySlug(categories.data, params.categorySlug)?.id;
    }
    return undefined;
  }, [params.categoryId, params.categorySlug, categories.data]);

  const [sort, setSort] = useState<ProductSort>(params.sort ?? 'relevance');
  const [brandId, setBrandId] = useState<string | undefined>(params.brandId);
  const [sortSheet, setSortSheet] = useState(false);
  const [filterSheet, setFilterSheet] = useState(false);

  const brands = useBrands();
  const add = useAddToCart();

  const slugUnresolved = Boolean(params.categorySlug) && !params.categoryId && categories.isSuccess && !resolvedCategoryId;

  const list = useProducts({ categoryId: resolvedCategoryId, brandId, sort });
  const products = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data],
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: params.title ?? 'Products' });
  }, [navigation, params.title]);

  const onPressProduct = (p: ProductCardDto) =>
    navigation.navigate('ProductDetail', { idOrSlug: p.slug });

  if (slugUnresolved) {
    return (
      <Screen>
        <EmptyState
          icon="magnify-close"
          title="Category not found"
          action={{ label: 'Browse categories', onPress: () => navigation.navigate('Main', { screen: 'CategoriesTab' }) }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.toolbar}>
        <Pressable style={styles.toolBtn} onPress={() => setSortSheet(true)} accessibilityRole="button">
          <Text style={styles.toolText}>Sort: {SORTS.find((s) => s.key === sort)?.label}</Text>
        </Pressable>
        <Pressable style={styles.toolBtn} onPress={() => setFilterSheet(true)} accessibilityRole="button">
          <Text style={styles.toolText}>{brandId ? 'Filter •' : 'Filter'}</Text>
        </Pressable>
      </View>
      {PAGE_LOCAL_SORTS.has(sort) ? (
        <Text style={styles.caption}>Price order applies within each loaded page.</Text>
      ) : null}

      {list.isLoading ? (
        <ProductGridSkeleton count={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : products.length === 0 ? (
        <EmptyState icon="package-variant" title="No products found" />
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
                onPress={() => onPressProduct(item)}
                onAdd={() => add.mutate({ variantId: item.defaultVariantId as string })}
                adding={add.isPending && add.variables?.variantId === item.defaultVariantId}
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

      <Sheet visible={sortSheet} title="Sort by" onClose={() => setSortSheet(false)}>
        <View style={styles.sheetBody}>
          {SORTS.map((s) => (
            <Pressable
              key={s.key}
              style={styles.sortRow}
              onPress={() => {
                setSort(s.key);
                setSortSheet(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: s.key === sort }}
            >
              <Text style={[styles.sortLabel, s.key === sort && styles.sortLabelActive]}>{s.label}</Text>
              {s.key === sort ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          ))}
        </View>
      </Sheet>

      <Sheet visible={filterSheet} title="Filter by brand" onClose={() => setFilterSheet(false)}>
        <View style={styles.sheetBody}>
          <View style={styles.brandChips}>
            <Chip label="All brands" selected={!brandId} onPress={() => setBrandId(undefined)} />
            {(brands.data ?? [])
              .filter((b) => b.isActive)
              .map((b) => (
                <Chip key={b.id} label={b.name} selected={brandId === b.id} onPress={() => setBrandId(b.id)} />
              ))}
          </View>
          <Button title="Done" fullWidth onPress={() => setFilterSheet(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  toolBtn: { flex: 1, minHeight: theme.touch.minTouch, alignItems: 'center', justifyContent: 'center' },
  toolText: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '600' },
  caption: { ...theme.typography.caption, color: theme.colors.muted, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },
  grid: { padding: theme.spacing.sm },
  cell: { flex: 1, padding: theme.spacing.sm },
  footer: { paddingVertical: theme.spacing.lg },
  sheetBody: { paddingVertical: theme.spacing.md, gap: theme.spacing.md },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: theme.touch.minTouch },
  sortLabel: { ...theme.typography.bodyLg, color: theme.colors.ink },
  sortLabelActive: { color: theme.colors.primaryStrong, fontWeight: '700' },
  check: { ...theme.typography.bodyLg, color: theme.colors.primaryStrong },
  brandChips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
});
