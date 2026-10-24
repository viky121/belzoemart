import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { resolveMobileCategories, type CategoryNodeDto } from '@belzo/shared';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { iconForCategory } from '@/lib/category-icon';
import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';
import { EmptyState, ErrorState, Screen } from '@/ui';
import { IconButton } from '@/ui/IconButton';
import { RemoteImage } from '@/ui/RemoteImage';
import { ListSkeleton } from '@/ui/Skeleton';

import { useMobileHome } from '@/features/home/hooks';
import { useBrand } from '@/theme/use-brand';

import { useCategories } from '../hooks';

type Nav = NavigationProp<RootStackParamList>;

function subtitleFor(node: CategoryNodeDto): string {
  const kids = node.children.slice(0, 3).map((c) => c.name);
  return kids.length > 0 ? kids.join(', ') : 'Shop all products';
}

/** Categories (Belzo eMart design): list of categories with thumbnail, subcategories and chevron. */
export function CategoriesScreen() {
  const navigation = useNavigation<Nav>();
  const { data, isLoading, isError, error, refetch } = useCategories();
  const mobileHome = useMobileHome();
  const brand = useBrand();
  // Same order / labels / icons / hidden flags as the home screen (admin "Mobile" module).
  const tiles = useMemo(
    () => resolveMobileCategories(data ?? [], mobileHome.categories),
    [data, mobileHome.categories],
  );

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

  if (tiles.length === 0) {
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
        data={tiles}
        keyExtractor={(c) => c.id}
        style={styles.list}
        contentContainerStyle={styles.listBody}
        renderItem={({ item: tile, index }) => {
          const item = tile.node;
          const sub = subtitleFor(item);
          return (
            <Pressable
              onPress={() => open(item)}
              accessibilityRole="button"
              accessibilityLabel={`${tile.name}. ${sub}`}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={[styles.thumb, { backgroundColor: brand.tints[index % brand.tints.length] }]}>
                {tile.iconUrl ? (
                  <RemoteImage uri={tile.iconUrl} width={64} height={64} radius={32} fallbackLabel={tile.name} />
                ) : (
                  <MaterialCommunityIcons name={iconForCategory(tile.name)} size={30} color={brand.primary} />
                )}
              </View>
              <View style={styles.text}>
                <Text style={styles.name} numberOfLines={1}>
                  {tile.name}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {sub}
                </Text>
              </View>
              <View style={[styles.chev, { backgroundColor: brand.primaryBg }]}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={brand.primary} />
              </View>
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
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  headerTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: theme.colors.inkStrong },
  pad: { padding: theme.spacing.lg },
  list: { backgroundColor: theme.colors.bg },
  listBody: { paddingTop: theme.spacing.md, paddingBottom: 96, gap: 10 },
  // Each category is its own soft card on the grey page.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  chev: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: theme.colors.inkStrong },
  sub: { ...theme.typography.caption, color: theme.colors.muted },
});
