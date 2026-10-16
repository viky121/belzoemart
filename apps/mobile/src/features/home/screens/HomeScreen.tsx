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

import { qk } from '@/api/query-keys';
import type { CartView } from '@/api/types';
import { useCategories } from '@/features/categories/hooks';
import { useUnreadCount } from '@/features/notifications/hooks';
import { useProducts } from '@/features/products/hooks';
import { useCardWishlist } from '@/features/wishlist/use-card-wishlist';
import type { RootStackParamList } from '@/navigation/types';
import { usePincodeStore } from '@/store/pincode';
import { useRecentlyViewedStore } from '@/store/recently-viewed';
import { useCartIdentity, useSessionStore } from '@/store/session';
import { theme } from '@/theme';
import { IconButton } from '@/ui/IconButton';
import { OfflineBanner } from '@/ui/OfflineBanner';
import { ProductCard } from '@/ui/ProductCard';
import { ProductRail } from '@/ui/ProductRail';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';

import { CategoryShortcuts } from '../components/CategoryShortcuts';
import { HeroBanner } from '../components/HeroBanner';
import { HomeRail } from '../components/HomeRail';
import { PincodeSheet } from '../components/PincodeSheet';
import { useHomeBanners, useRecentlyViewedProducts, useSettings } from '../hooks';
import { useOpenHref } from '../use-open-href';

type Nav = NavigationProp<RootStackParamList>;

/** Home tab (Belzo Mart design): header, search, banner, category grid, Deals of the Day. */
export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const openHref = useOpenHref();

  const settings = useSettings();
  const banners = useHomeBanners();
  const categories = useCategories();
  const heart = useCardWishlist();

  const pincode = usePincodeStore((s) => s.pincode);
  const isCustomer = useSessionStore((s) => s.status === 'authenticated');
  const unread = useUnreadCount();
  const recentIds = useRecentlyViewedStore((s) => s.ids);
  const recent = useRecentlyViewedProducts(recentIds);
  const cartIdentity = useCartIdentity();
  const { data: cartView } = useQuery<CartView>({ queryKey: qk.cart(cartIdentity), queryFn: skipToken });
  const cartCount = (cartView?.items ?? [])
    .filter((l) => !l.savedForLater)
    .reduce((n, l) => n + l.quantity, 0);
  const deals = useProducts({ sort: 'discount' });
  const dealItems = (deals.data?.pages[0]?.items ?? []).slice(0, 6);

  const [pinSheet, setPinSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const themeName: ThemeName = settings.data?.theme === 'classic' ? 'classic' : 'emart';
  const content = mergeHome(settings.isError ? 'emart' : themeName, settings.data?.home ?? null);
  const sections = getHomeSections(settings.data?.sections);

  const onPressProduct = useCallback(
    (p: ProductCardDto) => navigation.navigate('ProductDetail', { idOrSlug: p.slug }),
    [navigation],
  );
  const openCategory = useCallback(
    (node: CategoryNodeDto) =>
      navigation.navigate('ProductList', { categoryId: node.id, title: node.name }),
    [navigation],
  );
  const onViewAll = useCallback(
    (section: HomeSection) => {
      if (section.source.type === 'sort')
        navigation.navigate('ProductList', { sort: section.source.sort, title: section.title });
      else if (section.source.type === 'category')
        navigation.navigate('ProductList', { categoryId: section.source.categoryId, title: section.title });
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
        deals.refetch(),
        queryClient.invalidateQueries({ queryKey: ['home-rail'] }),
        recentIds.length > 0 ? recent.refetch() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [settings, banners, categories, deals, queryClient, recent, recentIds.length]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <OfflineBanner />
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.brand}>
            <BelzoLogo size={38} />
            <Text style={styles.wordmark}>
              Belzo <Text style={styles.wordmarkAccent}>Mart</Text>
            </Text>
          </View>
          <View style={styles.headerIcons}>
            <IconButton
              icon="bell-outline"
              label="Notifications"
              color={theme.colors.inkStrong}
              badge={isCustomer ? unread : undefined}
              onPress={() =>
                isCustomer ? navigation.navigate('Notifications') : navigation.navigate('Login')
              }
            />
            <IconButton
              icon="shopping-outline"
              label={cartCount ? `Cart, ${cartCount} items` : 'Cart'}
              color={theme.colors.inkStrong}
              badge={cartCount || undefined}
              onPress={() => navigation.navigate('Cart')}
            />
          </View>
        </View>

        <Pressable
          style={styles.search}
          onPress={() => navigation.navigate('Search')}
          accessibilityRole="search"
          accessibilityLabel="Search for products, brands and more"
        >
          <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.muted} />
          <Text style={styles.searchText} numberOfLines={1}>
            Search for products, brands and more...
          </Text>
        </Pressable>

        <Pressable
          style={styles.pinRow}
          onPress={() => setPinSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={pincode ? `Delivering to ${pincode}. Change PIN` : 'Set delivery PIN'}
        >
          <MaterialCommunityIcons name="map-marker-outline" size={15} color={theme.colors.primaryStrong} />
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
          categories={categories.data ?? []}
          onPressCategory={openCategory}
          onMore={() => navigation.navigate('Main', { screen: 'CategoriesTab' })}
        />

        {dealItems.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                Deals of the Day
              </Text>
              <Pressable
                onPress={() =>
                  navigation.navigate('ProductList', { sort: 'discount', title: 'Deals of the Day' })
                }
                accessibilityRole="link"
                accessibilityLabel="View all deals"
                hitSlop={8}
              >
                <Text style={styles.viewAll}>View All ›</Text>
              </Pressable>
            </View>
            <View style={styles.grid}>
              {dealItems.map((item) => (
                <View key={item.id} style={styles.gridCell}>
                  <ProductCard
                    product={item}
                    onPress={() => onPressProduct(item)}
                    wishlisted={heart.isWishlisted(item)}
                    onToggleWishlist={() => heart.onToggle(item)}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {sections.map((section) => (
          <HomeRail key={section.id} section={section} onPressProduct={onPressProduct} onViewAll={onViewAll} />
        ))}

        {recentIds.length > 0 ? (
          <ProductRail title="Recently viewed" products={recent.data ?? []} onPressProduct={onPressProduct} />
        ) : null}
      </ScrollView>

      <PincodeSheet visible={pinSheet} onClose={() => setPinSheet(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  header: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wordmark: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: theme.colors.inkStrong },
  wordmarkAccent: { color: theme.colors.primaryStrong },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 46,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  searchText: { ...theme.typography.body, color: theme.colors.muted, flex: 1 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pinText: { ...theme.typography.caption, color: theme.colors.ink, flexShrink: 1, fontWeight: '600' },
  body: { paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.xl },
  section: { marginTop: theme.spacing.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: theme.colors.inkStrong },
  viewAll: { ...theme.typography.body, color: theme.colors.primaryStrong, fontWeight: '700' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    rowGap: theme.spacing.md,
  },
  gridCell: { width: '48.5%' },
});
