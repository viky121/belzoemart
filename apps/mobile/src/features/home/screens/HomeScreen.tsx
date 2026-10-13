import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getHomeSections,
  mergeHome,
  type CategoryNodeDto,
  type HomeSection,
  type ProductCardDto,
  type ThemeName,
} from '@belzo/shared';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCategories } from '@/features/categories/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { usePincodeStore } from '@/store/pincode';
import { useRecentlyViewedStore } from '@/store/recently-viewed';
import { useSessionStore } from '@/store/session';
import { theme } from '@/theme';
import { ProductRail } from '@/ui/ProductRail';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';
import { OfflineBanner } from '@/ui/OfflineBanner';
import { SearchBar } from '@/ui/SearchBar';

import { CategoryShortcuts } from '../components/CategoryShortcuts';
import { HeroBanner } from '../components/HeroBanner';
import { HomeBlocks } from '../components/HomeBlocks';
import { HomeRail } from '../components/HomeRail';
import { PincodeSheet } from '../components/PincodeSheet';
import { PromoGrid } from '../components/PromoGrid';
import { WhyGrid } from '../components/WhyGrid';
import { useHomeBanners, useRecentlyViewedProducts, useSettings } from '../hooks';
import { useOpenHref } from '../use-open-href';

type Nav = NavigationProp<RootStackParamList>;

/** Home tab (design §11): header + banners/hero, categories, promos, rails, recently viewed, why, blocks. */
export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const openHref = useOpenHref();

  const settings = useSettings();
  const banners = useHomeBanners();
  const categories = useCategories();

  const pincode = usePincodeStore((s) => s.pincode);
  const isCustomer = useSessionStore((s) => s.status === 'authenticated');
  const recentIds = useRecentlyViewedStore((s) => s.ids);
  const recent = useRecentlyViewedProducts(recentIds);

  const [pinSheet, setPinSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const themeName: ThemeName = settings.data?.theme === 'classic' ? 'classic' : 'emart';
  const content = mergeHome(settings.isError ? 'emart' : themeName, settings.data?.home ?? null);
  const sections = getHomeSections(settings.data?.sections);
  const topCategories = categories.data ?? [];

  const onPressProduct = useCallback(
    (p: ProductCardDto) => navigation.navigate('ProductDetail', { idOrSlug: p.slug }),
    [navigation],
  );
  const onPressCategory = useCallback(
    (node: CategoryNodeDto) =>
      navigation.navigate('ProductList', { categoryId: node.id, title: node.name }),
    [navigation],
  );
  const onViewAll = useCallback(
    (section: HomeSection) => {
      if (section.source.type === 'sort') {
        navigation.navigate('ProductList', { sort: section.source.sort, title: section.title });
      } else if (section.source.type === 'category') {
        navigation.navigate('ProductList', { categoryId: section.source.categoryId, title: section.title });
      }
    },
    [navigation],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        settings.refetch(),
        banners.refetch(),
        categories.refetch(),
        queryClient.invalidateQueries({ queryKey: ['home-rail'] }),
        recentIds.length > 0 ? recent.refetch() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [settings, banners, categories, queryClient, recent, recentIds.length]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <OfflineBanner />
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <BelzoLogo size={32} />
          <Pressable
            style={styles.pinChip}
            onPress={() => setPinSheet(true)}
            accessibilityRole="button"
            accessibilityLabel={pincode ? `Delivering to ${pincode}. Change PIN` : 'Set delivery PIN'}
          >
            <MaterialCommunityIcons name="map-marker-outline" size={16} color={theme.colors.white} />
            <Text style={styles.pinText} numberOfLines={1}>
              {pincode ? `Deliver to ${pincode}` : 'Set delivery PIN'}
            </Text>
          </Pressable>
          {isCustomer ? (
            <Pressable
              onPress={() => navigation.navigate('Notifications')}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              hitSlop={8}
            >
              <MaterialCommunityIcons name="bell-outline" size={24} color={theme.colors.white} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.searchWrap}>
          <SearchBar editable={false} onPress={() => navigation.navigate('Search')} />
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        <HeroBanner banners={banners.data ?? []} hero={content.hero} onOpenHref={openHref} />
        <CategoryShortcuts categories={topCategories} onPressCategory={onPressCategory} />
        <PromoGrid promos={content.promos} onOpenHref={openHref} />
        {sections.map((section) => (
          <HomeRail
            key={section.id}
            section={section}
            onPressProduct={onPressProduct}
            onViewAll={onViewAll}
          />
        ))}
        {recentIds.length > 0 ? (
          <ProductRail
            title="Recently viewed"
            products={recent.data ?? []}
            onPressProduct={onPressProduct}
          />
        ) : null}
        <WhyGrid items={content.why} />
        <HomeBlocks blocks={content.blocks} onOpenHref={openHref} />
      </ScrollView>

      <PincodeSheet visible={pinSheet} onClose={() => setPinSheet(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  header: { backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, paddingTop: theme.spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  pinChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: 4,
  },
  pinText: { ...theme.typography.caption, color: theme.colors.white, flexShrink: 1 },
  searchWrap: { marginTop: theme.spacing.sm },
  body: { paddingBottom: theme.spacing.xl },
});
