import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { CategoryNodeDto } from '@belzo/shared';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';
import { Chip, EmptyState, ErrorState, Screen } from '@/ui';
import { ListSkeleton } from '@/ui/Skeleton';

import { useCategories } from '../hooks';

type Nav = NavigationProp<RootStackParamList>;

/** Categories (design §11): two-pane — level-1 list on the left, level-2/3 on the right. */
export function CategoriesScreen() {
  const navigation = useNavigation<Nav>();
  const { data, isLoading, isError, error, refetch } = useCategories();
  const [activeIndex, setActiveIndex] = useState(0);

  const openCategory = (node: CategoryNodeDto) =>
    navigation.navigate('ProductList', { categoryId: node.id, title: node.name });

  if (isLoading) {
    return (
      <Screen>
        <ListSkeleton rows={8} />
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const roots = data ?? [];
  if (roots.length === 0) {
    return (
      <Screen>
        <EmptyState icon="view-grid-outline" title="No categories yet" />
      </Screen>
    );
  }

  const active = roots[Math.min(activeIndex, roots.length - 1)]!;

  return (
    <Screen>
      <View style={styles.panes}>
        <View style={styles.left}>
          <FlatList
            data={roots}
            keyExtractor={(c) => c.id}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => setActiveIndex(index)}
                accessibilityRole="tab"
                accessibilityState={{ selected: index === activeIndex }}
                style={[styles.leftItem, index === activeIndex && styles.leftItemActive]}
              >
                <Text
                  style={[styles.leftText, index === activeIndex && styles.leftTextActive]}
                  numberOfLines={2}
                >
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        </View>

        <ScrollView style={styles.right} contentContainerStyle={styles.rightContent}>
          <Pressable onPress={() => openCategory(active)} accessibilityRole="button">
            <Text style={styles.rightTitle}>{active.name}</Text>
            <Text style={styles.viewAll}>View all {active.name} →</Text>
          </Pressable>

          {active.children.length === 0 ? (
            <Text style={styles.muted}>Tap above to browse {active.name}.</Text>
          ) : (
            active.children.map((l2) => (
              <View key={l2.id} style={styles.group}>
                <Pressable onPress={() => openCategory(l2)} accessibilityRole="button">
                  <Text style={styles.groupHeader}>{l2.name}</Text>
                </Pressable>
                {l2.children.length > 0 ? (
                  <View style={styles.chips}>
                    {l2.children.map((l3) => (
                      <Chip key={l3.id} label={l3.name} onPress={() => openCategory(l3)} />
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panes: { flex: 1, flexDirection: 'row' },
  left: { width: 116, borderRightWidth: 1, borderRightColor: theme.colors.border, backgroundColor: theme.colors.surface2 },
  leftItem: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.sm, minHeight: theme.touch.minTouch, justifyContent: 'center' },
  leftItemActive: { backgroundColor: theme.colors.surface, borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
  leftText: { ...theme.typography.caption, color: theme.colors.ink },
  leftTextActive: { color: theme.colors.inkStrong, fontWeight: '700' },
  right: { flex: 1 },
  rightContent: { padding: theme.spacing.lg, gap: theme.spacing.md },
  rightTitle: { ...theme.typography.title, color: theme.colors.inkStrong },
  viewAll: { ...theme.typography.caption, color: theme.colors.primaryStrong, marginTop: 2 },
  muted: { ...theme.typography.body, color: theme.colors.muted },
  group: { gap: theme.spacing.sm },
  groupHeader: { ...theme.typography.bodyLg, color: theme.colors.inkStrong, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
});
