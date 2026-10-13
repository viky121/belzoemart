import type { ProductCardDto } from '@belzo/shared';
import { FlatList, StyleSheet, View } from 'react-native';

import { theme } from '@/theme';

import { ProductCard } from './ProductCard';
import { SectionHeader } from './SectionHeader';

export interface ProductRailProps {
  title: string;
  products: ProductCardDto[];
  onPressProduct: (product: ProductCardDto) => void;
  onAdd?: (product: ProductCardDto) => void;
  addingId?: string | null;
  onViewAll?: () => void;
}

/** Horizontal rail of compact ProductCards; rails with no products render nothing. */
export function ProductRail({
  title,
  products,
  onPressProduct,
  onAdd,
  addingId,
  onViewAll,
}: ProductRailProps) {
  if (products.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <SectionHeader title={title} onAction={onViewAll} />
      <FlatList
        horizontal
        data={products}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ProductCard
            compact
            product={item}
            onPress={() => onPressProduct(item)}
            onAdd={onAdd ? () => onAdd(item) : undefined}
            adding={addingId === item.id}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: theme.spacing.md },
  list: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm },
});
