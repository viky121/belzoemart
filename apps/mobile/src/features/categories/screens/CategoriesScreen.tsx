import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { CategoryNodeDto } from '@belzo/shared';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { iconForCategory } from '@/lib/category-icon';
import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';
import { EmptyState, ErrorState, Screen } from '@/ui';
import { IconButton } from '@/ui/IconButton';
import { RemoteImage } from '@/ui/RemoteImage';
import { ListSkeleton } from '@/ui/Skeleton';

import { useCategories } from '../hooks';

type Nav = NavigationProp<RootStackParamList>;

const PASTELS = ['#e4f3ec', '#fdeee4', '#e7f0ff', '#f3e8ff', '#e2f7ff', '#fff2d9', '#ffe3ec'] as const;

function subtitleFor(node: CategoryNodeDto): string {
  const kids = node.children.slice(0, 3).map((c) => c.name);
  return kids.length > 0 ? kids.join(', ') : 'Shop all products';
}

/** Categories (Belzo Mart design): list of categories with thumbnail, subcategories and chevron. */
export function CategoriesScreen() {
  const navigation = useNavigation<Nav>();
  const { data, isLoading, isError, error, refetch } = useCategories();

  const open = (node: CategoryNodeDto) =>
    navigation.navigate('ProductList', { categoryId: node.id, title: node.name });

  const header = (
    <View style={styles.header}>
      <Text style={styles.headerTitle} accessibilityRole="header">
        Categories
      </Text>
      <IconButton icon="magnify" label="Search" onPress={() => navigation.navigate('Search')} />
    </View>
  );

  if (isLoading) {
    return (
      <Screen>
        {header}
        <View style={styles.pad}>
          <ListSkeleton rows={8} />
        </View>
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen>
        {header}
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const roots = data ?? [];
  if (roots.length === 0) {
    return (
      <Screen>
        {header}
        <EmptyState icon="view-grid-outline" title="No categories yet" />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <FlatList
        data={roots}
        keyExtractor={(c) => c.id}
        style={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item, index }) => {
          const sub = subtitleFor(item);
          return (
            <Pressable
              onPress={() => open(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}. ${sub}`}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={[styles.thumb, { backgroundColor: PASTELS[index % PASTELS.length] }]}>
                {item.imageUrl ? (
                  <RemoteImage uri={item.imageUrl} width={56} height={56} radius={theme.radius.md} fallbackLabel={item.name} />
                ) : (
                  <MaterialCommunityIcons name={iconForCategory(item.name)} size={30} color={theme.colors.primaryStrong} />
                )}
              </View>
              <View style={styles.text}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {sub}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.mutedSoft} />
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: theme.colors.inkStrong },
  pad: { padding: theme.spacing.lg },
  list: { backgroundColor: theme.colors.surface },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  pressed: { backgroundColor: theme.colors.surface2 },
  sep: { height: 1, backgroundColor: theme.colors.border2, marginLeft: theme.spacing.lg + 64 + theme.spacing.md },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: theme.colors.inkStrong },
  sub: { ...theme.typography.caption, color: theme.colors.muted },
});
