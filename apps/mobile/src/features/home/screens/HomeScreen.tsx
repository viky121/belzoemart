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
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCategories } from '@/features/categories/hooks';
import { useUnreadCount } from '@/features/notifications/hooks';
import { IconButton } from '@/ui/IconButton';
import type { RootStackParamList } from '@/navigation/types';
import { qk } from '@/api/query-keys';
import type { CartView } from '@/api/types';
import { usePincodeStore } from '@/store/pincode';
import { useRecentlyViewedStore } from '@/store/recently-viewed';
import { useCartIdentity, useSessionStore } from '@/store/session';
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
  const unread = useUnreadCount();
  const recentIds = useRecentlyViewedStore((s) => s.ids);
  const recent = useRecentlyViewedProducts(recentIds);
  const cartIdentity = useCartIdentity();
  const { data: cartView } = useQuery<CartView>({
    queryKey: qk.cart(cartIdentity),
    queryFn: skipToken,
  });
  const cartCount = (cartView?.items ?? [])
    .filter((l) => !l.savedForLater)
    .reduce((n, l) => n + l.quantity, 0);

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
          <View style={styles.brand}>
            <BelzoLogo size={30} />
            <Text style={styles.wordmark}>
              Belzo <Text style={styles.wordmarkAccent}>Mart</Text>
            </Text>
          </View>
          <View style={styles.headerIcons}>
            {isCustomer ? (
              <IconButton
                icon="bell-outline"
                label="Notifications"
                color={theme.colors.ink}
                badge={unread}
                onPress={() => navigation.navigate('Notifications')}
              />
            ) : null}
            <IconButton
              icon="cart-outline"
              label="Cart"
              color={theme.colors.ink}
              badge={cartCount || undefined}
              onPress={() => navigation.navigate('Main', { screen: 'CartTab' })}
            />
          </View>
        </View>
        <View style={styles.searchWrap}>
          <SearchBar editable={false} onPress={() => navigation.navigate('Search')} />
        </View>
        <Pressable
          style={styles.pinRow}
          onPress={() => setPinSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={pincode ? `Delivering to ${pincode}. Change PIN` : 'Set delivery PIN'}
        >
          <MaterialCommunityIcons
            name="map-marker-outline"
            size={15}
            color={theme.colors.primaryStrong}
          />
          <Text style={styles.pinText} numberOfLines={1}>
            {pincode ? `Deliver to ${pincode}` : 'Set delivery PIN'}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={16} color={theme.colors.muted} />
        </Pressable>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        <HeroBanner banners={banners.data ?? []} hero={content.hero} onOpenHref={openHref} />
        <CategoryShortcuts
          categories={topCategories}
          onPressCategory={onPressCategory}
          onMore={() => navigation.navigate('Main', { screen: 'CategoriesTab' })}
        />
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
  header: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  wordmark: { ...theme.typography.title, color: theme.colors.ink },
  wordmarkAccent: { color: theme.colors.primaryStrong },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xxs,
    marginTop: theme.spacing.sm,
  },
  pinText: { ...theme.typography.caption, color: theme.colors.ink, flexShrink: 1 },
  searchWrap: { marginTop: theme.spacing.sm },
  body: { paddingBottom: theme.spacing.xl },
});
