import type { CategoryNodeDto, MobileCategoryTile, ProductCardDto } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { gridCellWidth, ProductGridCard, SectionHeader, useGridColumns, type ProductCardProps } from '@/ui';
import { HOME_CATEGORY_PAGE, useCategoryBlock } from '../hooks';

/** Space at each side of a block's grid, and between two cards. */
const PAD = theme.spacing.md;
const GAP = 8;

/** Products from every page loaded so far, each once (a page can shift while the shop changes). */
export function flattenUnique(pages: readonly { items: ProductCardDto[] }[]): ProductCardDto[] {
  const seen = new Set<string>();
  const out: ProductCardDto[] = [];
  for (const page of pages) {
    for (const p of page.items) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        out.push(p);
      }
    }
  }
  return out;
}

export interface CategoryProductBlockProps {
  tile: MobileCategoryTile;
  onPressProduct: (p: ProductCardDto) => void;
  onOpenCategory: (node: CategoryNodeDto) => void;
  cardProps: (p: ProductCardDto) => Partial<ProductCardProps>;
  isWishlisted: (p: ProductCardDto) => boolean;
  onToggleWishlist: (p: ProductCardDto) => void;
}

/**
 * One category on the home page: its name, six products (two rows of three), and a "See more" button.
 * "See more" adds the next six products of that category under the first ones. The button is there only
 * while the category still has products that are not shown; a category with six or fewer never shows it.
 * A category with no products, or one that failed to load, shows nothing (the home page must not break).
 */
export function CategoryProductBlock({
  tile,
  onPressProduct,
  onOpenCategory,
  cardProps,
  isWishlisted,
  onToggleWishlist,
}: CategoryProductBlockProps) {
  const brand = useBrand();
  const cols = useGridColumns();
  const { width } = useWindowDimensions();
  const q = useCategoryBlock(tile.id);
  const items = useMemo(() => flattenUnique(q.data?.pages ?? []), [q.data]);
  if (q.isLoading || q.isError || items.length === 0) return null;
  const cell = gridCellWidth(width, cols, PAD, GAP);
  return (
    <View style={styles.block} testID={`category-block-${tile.id}`}>
      <SectionHeader title={tile.name} onAction={() => onOpenCategory(tile.node)} />
      <View style={styles.grid}>
        {items.map((p) => (
          <View key={p.id} style={{ width: cell }}>
            <ProductGridCard
              dense={cols === 3}
              product={p}
              onPress={() => onPressProduct(p)}
              wishlisted={isWishlisted(p)}
              onToggleWishlist={() => onToggleWishlist(p)}
              {...cardProps(p)}
            />
          </View>
        ))}
      </View>
      {q.hasNextPage ? (
        <Pressable
          onPress={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
          accessibilityRole="button"
          accessibilityLabel={`See more ${tile.name}`}
          accessibilityState={{ busy: q.isFetchingNextPage }}
          style={({ pressed }) => [styles.more, { backgroundColor: brand.primaryBg }, pressed && styles.pressed]}
          testID={`category-see-more-${tile.id}`}
        >
          {q.isFetchingNextPage ? (
            <>
              <ActivityIndicator size="small" color={brand.primary} />
              <Text style={[styles.moreText, { color: brand.primary }]}>Loading…</Text>
            </>
          ) : (
            <>
              <Text style={[styles.moreText, { color: brand.primary }]}>See more</Text>
              <MaterialCommunityIcons name="chevron-down" size={20} color={brand.primary} />
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export interface CategoryProductBlocksProps extends Omit<CategoryProductBlockProps, 'tile'> {
  /** The home categories in the admin's order (hidden ones already left out). */
  tiles: MobileCategoryTile[];
}

/** Every home category as its own block, one after another. */
export function CategoryProductBlocks({ tiles, ...rest }: CategoryProductBlocksProps) {
  return (
    <>
      {tiles.map((t) => (
        <CategoryProductBlock key={t.id} tile={t} {...rest} />
      ))}
    </>
  );
}

export { HOME_CATEGORY_PAGE };

const styles = StyleSheet.create({
  block: { marginTop: theme.spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: PAD, columnGap: GAP, rowGap: GAP },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    marginHorizontal: PAD,
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.lg,
  },
  moreText: { fontSize: 14, lineHeight: 20, fontWeight: '800' },
  pressed: { opacity: 0.8 },
});
