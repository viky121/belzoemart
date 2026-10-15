import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { CategoryNodeDto } from '@belzo/shared';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';
import { EmptyState, ErrorState, Screen } from '@/ui';
import { IconButton } from '@/ui/IconButton';
import { ListSkeleton } from '@/ui/Skeleton';

import { useCategories } from '../hooks';

type Nav = NavigationProp<RootStackParamList>;
type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const PASTELS = ['#e4f3ec', '#fdeee4', '#e7f0ff', '#f3e8ff', '#e2f7ff', '#fff2d9', '#ffe3ec'] as const;

/** Map a category/subcategory name to a relevant icon (API provides no images). */
function iconForCategory(name: string): IconName {
  const s = name.toLowerCase();
  // Personal care
  if (/\bhair\b|shampoo/.test(s)) return 'hair-dryer-outline';
  if (/skin|lotion|cream|moistur|face/.test(s)) return 'lotion-outline';
  if (/oral|tooth|dental/.test(s)) return 'toothbrush';
  if (/bath|spa|shower|soap|body\s*wash/.test(s)) return 'shower';
  if (/perfume|fragrance|\bdeo/.test(s)) return 'spray';
  if (/shav|razor|groom|beard/.test(s)) return 'razor-double-edge';
  if (/makeup|beaut|cosmet|lipstick/.test(s)) return 'lipstick';
  // Home care / household
  if (/laundry|deterg|washing|fabric/.test(s)) return 'washing-machine';
  if (/dish|utensil/.test(s)) return 'silverware-fork-knife';
  if (/freshener|air\s*fresh/.test(s)) return 'air-filter';
  if (/home\s*care|household|clean|floor|toilet|disinfect/.test(s)) return 'spray-bottle';
  // Grocery
  if (/atta|flour|rice|grain|staple/.test(s)) return 'rice';
  if (/oil|ghee/.test(s)) return 'bottle-tonic';
  if (/spice|masala/.test(s)) return 'shaker-outline';
  if (/snack|namkeen|chips/.test(s)) return 'food-croissant';
  if (/dairy|milk|curd|cheese|butter/.test(s)) return 'cup-water';
  if (/beverage|drink|juice|tea|coffee|water/.test(s)) return 'cup';
  if (/biscuit|cookie|chocolate|sweet|candy/.test(s)) return 'cookie';
  if (/veg|fruit|fresh/.test(s)) return 'food-apple-outline';
  if (/food|grocer/.test(s)) return 'basket-outline';
  // Baby
  if (/diaper/.test(s)) return 'baby-face-outline';
  if (/baby\s*food|formula/.test(s)) return 'baby-bottle-outline';
  if (/baby|infant/.test(s)) return 'baby-carriage';
  // Other top-level
  if (/fashion|cloth|apparel|wear|shirt|footwear|shoe/.test(s)) return 'tshirt-crew-outline';
  if (/mobile|phone|laptop|gadget|device|\btv\b|electro|appliance/.test(s)) return 'cellphone';
  if (/home|furnit|decor|living|kitchen/.test(s)) return 'sofa-outline';
  if (/book|station|office/.test(s)) return 'book-open-variant';
  if (/health|pharma|medic|wellness/.test(s)) return 'heart-pulse';
  if (/sport|fit|gym|outdoor/.test(s)) return 'dumbbell';
  if (/toy|game/.test(s)) return 'teddy-bear';
  if (/pet/.test(s)) return 'paw';
  return 'tag-outline';
}

/** Categories (Flipkart-style): left category rail + right subcategory grid. */
export function CategoriesScreen() {
  const navigation = useNavigation<Nav>();
  const { data, isLoading, isError, error, refetch } = useCategories();
  const [active, setActive] = useState(0);

  const openCategory = (node: CategoryNodeDto) =>
    navigation.navigate('ProductList', { categoryId: node.id, title: node.name });

  const header = (
    <View style={styles.header}>
      <Text style={styles.headerTitle} accessibilityRole="header">
        All Categories
      </Text>
      <IconButton icon="magnify" label="Search" onPress={() => navigation.navigate('Search')} />
    </View>
  );

  if (isLoading) {
    return (
      <Screen>
        {header}
        <View style={styles.loading}>
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

  const activeCat = roots[Math.min(active, roots.length - 1)]!;
  const tiles = activeCat.children.length > 0 ? activeCat.children : [activeCat];

  return (
    <Screen>
      {header}
      <View style={styles.panes}>
        <ScrollView style={styles.rail} showsVerticalScrollIndicator={false}>
          {roots.map((c, i) => {
            const on = i === active;
            return (
              <Pressable
                key={c.id}
                onPress={() => setActive(i)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={c.name}
                style={[styles.railItem, on && styles.railItemOn]}
              >
                <View style={[styles.railIcon, on && styles.railIconOn]}>
                  <MaterialCommunityIcons
                    name={iconForCategory(c.name)}
                    size={24}
                    color={on ? theme.colors.primaryStrong : theme.colors.muted}
                  />
                </View>
                <Text style={[styles.railText, on && styles.railTextOn]} numberOfLines={2}>
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.contentTitle} numberOfLines={1}>
            {activeCat.name}
          </Text>
          <Pressable onPress={() => openCategory(activeCat)} accessibilityRole="link">
            <Text style={styles.viewAll}>Shop all {activeCat.name} ›</Text>
          </Pressable>

          <View style={styles.grid}>
            {tiles.map((t, i) => (
              <Pressable
                key={t.id}
                style={styles.tile}
                onPress={() => openCategory(t)}
                accessibilityRole="button"
                accessibilityLabel={t.name}
              >
                <View style={[styles.tileIcon, { backgroundColor: PASTELS[i % PASTELS.length] }]}>
                  <MaterialCommunityIcons
                    name={iconForCategory(t.name)}
                    size={26}
                    color={theme.colors.primaryStrong}
                  />
                </View>
                <Text style={styles.tileName} numberOfLines={2}>
                  {t.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
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
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  headerTitle: { ...theme.typography.heading, color: theme.colors.inkStrong },
  loading: { padding: theme.spacing.lg },
  panes: { flex: 1, flexDirection: 'row' },
  rail: {
    width: 100,
    backgroundColor: theme.colors.surface2,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  railItem: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  railItemOn: { backgroundColor: theme.colors.surface, borderLeftColor: theme.colors.primaryStrong },
  railIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border2,
  },
  railIconOn: { backgroundColor: theme.colors.primaryBg, borderColor: theme.colors.primaryBg },
  railText: { ...theme.typography.caption, color: theme.colors.muted, textAlign: 'center' },
  railTextOn: { color: theme.colors.inkStrong, fontWeight: '700' },
  content: { flex: 1 },
  contentInner: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg },
  contentTitle: { ...theme.typography.title, color: theme.colors.inkStrong },
  viewAll: {
    ...theme.typography.caption,
    color: theme.colors.primaryStrong,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: theme.spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { width: '33.33%', alignItems: 'center', paddingVertical: theme.spacing.md, gap: 6 },
  tileIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: {
    ...theme.typography.caption,
    fontSize: 11,
    lineHeight: 14,
    color: theme.colors.ink,
    textAlign: 'center',
  },
});
