import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { CategoryNodeDto } from '@belzo/shared';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';
import { EmptyState, ErrorState, Screen } from '@/ui';
import { IconButton } from '@/ui/IconButton';
import { RemoteImage } from '@/ui/RemoteImage';
import { ListSkeleton } from '@/ui/Skeleton';

import { useCategories } from '../hooks';

type Nav = NavigationProp<RootStackParamList>;

const PASTELS = ['#e4f3ec', '#fdeee4', '#e7f0ff', '#f3e8ff', '#e2f7ff', '#fff2d9', '#ffe3ec'] as const;

function subtitleFor(node: CategoryNodeDto): string | undefined {
  const kids = node.children?.slice(0, 3).map((c) => c.name) ?? [];
  return kids.length > 0 ? kids.join(', ') : undefined;
}

/** Categories (design §11): a scrollable list of category rows with thumbnail + chevron. */
export function CategoriesScreen() {
  const navigation = useNavigation<Nav>();
  const { data, isLoading, isError, error, refetch } = useCategories();

  const openCategory = (node: CategoryNodeDto) =>
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
        <View style={styles.list}>
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
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const subtitle = subtitleFor(item);
          return (
            <Pressable
              onPress={() => openCategory(item)}
              accessibilityRole="button"
              accessibilityLabel={subtitle ? `${item.name}. ${subtitle}` : item.name}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={[styles.thumb, { backgroundColor: PASTELS[index % PASTELS.length] }]}>
                <RemoteImage
                  uri={item.imageUrl}
                  width={40}
                  height={40}
                  radius={theme.radius.sm}
                  fallbackLabel={item.name}
                />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                {subtitle ? (
                  <Text style={styles.sub} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={22}
                color={theme.colors.mutedSoft}
              />
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
    paddingVertical: theme.spacing.sm,
  },
  headerTitle: { ...theme.typography.heading, color: theme.colors.inkStrong },
  list: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border2,
    padding: theme.spacing.md,
    minHeight: 68,
  },
  pressed: { opacity: 0.85 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  name: { ...theme.typography.bodyLg, color: theme.colors.inkStrong, fontWeight: '700' },
  sub: { ...theme.typography.caption, color: theme.colors.muted },
});
