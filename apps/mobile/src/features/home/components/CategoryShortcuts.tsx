import type { CategoryNodeDto } from '@belzo/shared';
import { FlatList, StyleSheet } from 'react-native';

import { theme } from '@/theme';
import { CategoryCard } from '@/ui/CategoryCard';

export interface CategoryShortcutsProps {
  categories: CategoryNodeDto[];
  onPressCategory: (node: CategoryNodeDto) => void;
}

/** Horizontal row of top-level category tiles (design §11 Home). */
export function CategoryShortcuts({ categories, onPressCategory }: CategoryShortcutsProps) {
  if (categories.length === 0) return null;
  return (
    <FlatList
      horizontal
      data={categories}
      keyExtractor={(c) => c.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <CategoryCard node={item} onPress={() => onPressCategory(item)} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md, paddingVertical: theme.spacing.sm },
});
