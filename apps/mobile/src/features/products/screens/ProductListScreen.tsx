import type { ProductCardDto, ProductSort } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCategories } from '@/features/categories/hooks';
import { findBySlug, flattenCategories } from '@/features/categories/tree';
import { useCardWishlist } from '@/features/wishlist/use-card-wishlist';
import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { Button, Chip, EmptyState, ErrorState, ProductCard, Screen } from '@/ui';
import { IconButton } from '@/ui/IconButton';
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
const PRICE_SORTS: { key: ProductSort; label: string }[] = [
  { key: 'price_asc', label: 'Low to High' },
  { key: 'price_desc', label: 'High to Low' },
];

type SheetKind = 'sort' | 'brand' | 'price' | null;

function DropChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.drop, active && styles.dropOn]}
    >
      <Text style={[styles.dropText, active && styles.dropTextOn]} numberOfLines={1}>
        {label}
      </Text>
      <MaterialCommunityIcons
        name="chevron-down"
        size={16}
        color={active ? theme.colors.primaryStrong : theme.colors.ink}
      />
    </Pressable>
  );
}

/** Product list (Belzo Mart design): subcategory pills, Sort/Brand/Price chips, 2-column grid. */
export function ProductListScreen({ navigation, route }: RootScreenProps<'ProductList'>) {
  const params = route.params ?? {};
  const categories = useCategories();
  const heart = useCardWishlist();

  const resolvedCategoryId = useMemo(() => {
    if (params.categoryId) return params.categoryId;
    if (params.categorySlug && categories.data) {
      return findBySlug(categories.data, params.categorySlug)?.id;
    }
    return undefined;
  }, [params.categoryId, params.categorySlug, categories.data]);

  const node = useMemo(
    () =>
      resolvedCategoryId && categories.data
        ? flattenCategories(categories.data).find((c) => c.id === resolvedCategoryId)
        : undefined,
    [resolvedCategoryId, categories.data],
  );
  const subs = node?.children ?? [];

  const [subId, setSubId] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<ProductSort>(params.sort ?? 'relevance');
  const [brandId, setBrandId] = useState<string | undefined>(params.brandId);
  const [sheet, setSheet] = useState<SheetKind>(null);

  const brands = useBrands();
  const activeBrands = (brands.data ?? []).filter((b) => b.isActive);

  const slugUnresolved =
    Boolean(params.categorySlug) && !params.categoryId && categories.isSuccess && !resolvedCategoryId;

  const list = useProducts({ categoryId: subId ?? resolvedCategoryId, brandId, sort });
  const products = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: params.title ?? node?.name ?? 'Products',
      headerRight: () => (
        <View style={styles.headerIcons}>
          <IconButton icon="magnify" label="Search" onPress={() => navigation.navigate('Search')} />
          <IconButton icon="tune-variant" label="Filters" onPress={() => setSheet('brand')} />
        </View>
      ),
    });
  }, [navigation, params.title, node?.name]);

  const onPressProduct = (p: ProductCardDto) =>
    navigation.navigate('ProductDetail', { idOrSlug: p.slug });

  if (slugUnresolved) {
    return (
      <Screen>
        <EmptyState
          icon="magnify-close"
          title="Category not found"
          action={{
            label: 'Browse categories',
            onPress: () => navigation.navigate('Main', { screen: 'CategoriesTab' }),
          }}
        />
      </Screen>
    );
  }

  const isPriceSort = sort === 'price_asc' || sort === 'price_desc';
  const sortLabel = isPriceSort ? 'Sort' : sort === 'relevance' ? 'Sort' : SORTS.find((s) => s.key === sort)?.label ?? 'Sort';
  const brandLabel = brandId ? activeBrands.find((b) => b.id === brandId)?.name ?? 'Brand' : 'Brand';
  const priceLabel = sort === 'price_asc' ? 'Price ↑' : sort === 'price_desc' ? 'Price ↓' : 'Price';

  return (
    <Screen edges={['left', 'right']}>
      <View style={styles.toolbar}>
        {subs.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
            <Chip label="All" selected={!subId} onPress={() => setSubId(undefined)} />
            {subs.map((s) => (
              <Chip key={s.id} label={s.name} selected={subId === s.id} onPress={() => setSubId(s.id)} />
            ))}
          </ScrollView>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.drops}>
          <DropChip label={sortLabel} active={!isPriceSort && sort !== 'relevance'} onPress={() => setSheet('sort')} />
          <DropChip label={brandLabel} active={Boolean(brandId)} onPress={() => setSheet('brand')} />
          <DropChip label={priceLabel} active={isPriceSort} onPress={() => setSheet('price')} />
        </ScrollView>
      </View>

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
                wishlisted={heart.isWishlisted(item)}
                onToggleWishlist={() => heart.onToggle(item)}
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

      <Sheet visible={sheet === 'sort'} title="Sort by" onClose={() => setSheet(null)}>
        <View style={styles.sheetBody}>
          {SORTS.map((s) => (
            <Pressable
              key={s.key}
              style={styles.sortRow}
              onPress={() => {
                setSort(s.key);
                setSheet(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: s.key === sort }}
            >
              <Text style={[styles.sortLabel, s.key === sort && styles.sortLabelActive]}>{s.label}</Text>
              {s.key === sort ? (
                <MaterialCommunityIcons name="check" size={20} color={theme.colors.primaryStrong} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </Sheet>

      <Sheet visible={sheet === 'price'} title="Price" onClose={() => setSheet(null)}>
        <View style={styles.sheetBody}>
          {PRICE_SORTS.map((s) => (
            <Pressable
              key={s.key}
              style={styles.sortRow}
              onPress={() => {
                setSort(s.key);
                setSheet(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: s.key === sort }}
            >
              <Text style={[styles.sortLabel, s.key === sort && styles.sortLabelActive]}>{s.label}</Text>
              {s.key === sort ? (
                <MaterialCommunityIcons name="check" size={20} color={theme.colors.primaryStrong} />
              ) : null}
            </Pressable>
          ))}
          {isPriceSort ? (
            <Button
              title="Clear"
              variant="ghost"
              onPress={() => {
                setSort('relevance');
                setSheet(null);
              }}
            />
          ) : null}
        </View>
      </Sheet>

      <Sheet visible={sheet === 'brand'} title="Brand" onClose={() => setSheet(null)}>
        <View style={styles.sheetBody}>
          <View style={styles.brandChips}>
            <Chip label="All brands" selected={!brandId} onPress={() => setBrandId(undefined)} />
            {activeBrands.map((b) => (
              <Chip key={b.id} label={b.name} selected={brandId === b.id} onPress={() => setBrandId(b.id)} />
            ))}
          </View>
          <Button title="Done" fullWidth onPress={() => setSheet(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  toolbar: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  pills: { gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg },
  drops: { gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg },
  drop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  dropOn: { borderColor: theme.colors.primaryStrong, backgroundColor: theme.colors.primaryBg },
  dropText: { ...theme.typography.body, color: theme.colors.ink, maxWidth: 140 },
  dropTextOn: { color: theme.colors.primaryStrong, fontWeight: '700' },
  grid: { padding: theme.spacing.sm },
  cell: { flex: 1, padding: theme.spacing.xs },
  footer: { paddingVertical: theme.spacing.lg },
  sheetBody: { paddingVertical: theme.spacing.md, gap: theme.spacing.md },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.touch.minTouch,
  },
  sortLabel: { ...theme.typography.bodyLg, color: theme.colors.ink },
  sortLabelActive: { color: theme.colors.primaryStrong, fontWeight: '700' },
  brandChips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
});
