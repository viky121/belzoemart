import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  formatInr,
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
import { iconForCategory } from '@/lib/category-icon';
import type { RootStackParamList } from '@/navigation/types';
import { usePincodeStore } from '@/store/pincode';
import { useRecentlyViewedStore } from '@/store/recently-viewed';
import { useCartIdentity, useSessionStore } from '@/store/session';
import { theme } from '@/theme';
import { Gradient } from '@/ui/Gradient';
import { IconButton } from '@/ui/IconButton';
import { ProductCard } from '@/ui/ProductCard';
import { ProductRail } from '@/ui/ProductRail';
import { RemoteImage } from '@/ui/RemoteImage';
import { SectionHeader } from '@/ui/SectionHeader';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';
import { OfflineBanner } from '@/ui/OfflineBanner';

import { HeroBanner } from '../components/HeroBanner';
import { HomeBlocks } from '../components/HomeBlocks';
import { HomeRail } from '../components/HomeRail';
import { PincodeSheet } from '../components/PincodeSheet';
import { PromoGrid } from '../components/PromoGrid';
import { WhyGrid } from '../components/WhyGrid';
import { useHomeBanners, useRecentlyViewedProducts, useSettings } from '../hooks';
import { useOpenHref } from '../use-open-href';

type Nav = NavigationProp<RootStackParamList>;

const HEADER_GRADIENT = ['#1f9268', '#0c5942'] as const;

function discountPct(p: ProductCardDto): number {
  if (!p.mrp || p.mrp <= p.sellingPrice) return 0;
  return Math.round(((p.mrp - p.sellingPrice) / p.mrp) * 100);
}

/** Home tab: Flipkart-style gradient header (quick links + search + category strip) + deal cards. */
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
  const { data: cartView } = useQuery<CartView>({ queryKey: qk.cart(cartIdentity), queryFn: skipToken });
  const cartCount = (cartView?.items ?? [])
    .filter((l) => !l.savedForLater)
    .reduce((n, l) => n + l.quantity, 0);
  const deals = useProducts({ sort: 'discount' });
  const dealItems = deals.data?.pages[0]?.items ?? [];
  const popular = useProducts({});
  const popularItems = popular.data?.pages[0]?.items ?? [];

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
        popular.refetch(),
        queryClient.invalidateQueries({ queryKey: ['home-rail'] }),
        recentIds.length > 0 ? recent.refetch() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [settings, banners, categories, deals, popular, queryClient, recent, recentIds.length]);

  const quickLinks: { icon: Parameters<typeof IconButton>[0]['icon']; label: string; onPress: () => void }[] = [
    { icon: 'view-grid-outline', label: 'Categories', onPress: () => navigation.navigate('Main', { screen: 'CategoriesTab' }) },
    { icon: 'sale-outline', label: 'Deals', onPress: () => navigation.navigate('ProductList', { sort: 'discount', title: 'Deals for you' }) },
    { icon: 'package-variant-closed', label: 'Orders', onPress: () => navigation.navigate('Orders') },
    { icon: 'heart-outline', label: 'Wishlist', onPress: () => navigation.navigate('Wishlist') },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <OfflineBanner />
      <Gradient colors={HEADER_GRADIENT} style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brand}>
            <View style={styles.logoChip}>
              <BelzoLogo size={26} />
            </View>
            <Text style={styles.wordmark}>Belzo Mart</Text>
          </View>
          <View style={styles.headerIcons}>
            {isCustomer ? (
              <IconButton
                icon="bell-outline"
                label="Notifications"
                color={theme.colors.white}
                badge={unread}
                onPress={() => navigation.navigate('Notifications')}
              />
            ) : null}
            <IconButton
              icon="cart-outline"
              label="Cart"
              color={theme.colors.white}
              badge={cartCount || undefined}
              onPress={() => navigation.navigate('Main', { screen: 'CartTab' })}
            />
          </View>
        </View>

        <View style={styles.quickRow}>
          {quickLinks.map((q) => (
            <Pressable
              key={q.label}
              style={styles.quickPill}
              onPress={q.onPress}
              accessibilityRole="button"
              accessibilityLabel={q.label}
            >
              <MaterialCommunityIcons name={q.icon} size={16} color={theme.colors.primaryStrong} />
              <Text style={styles.quickText}>{q.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={styles.pinRow}
          onPress={() => setPinSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={pincode ? `Delivering to ${pincode}. Change PIN` : 'Set delivery PIN'}
        >
          <MaterialCommunityIcons name="map-marker-outline" size={15} color={theme.colors.white} />
          <Text style={styles.pinText} numberOfLines={1}>
            {pincode ? `Deliver to ${pincode}` : 'Set delivery PIN'}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={16} color={theme.colors.white} />
        </Pressable>

        <Pressable
          style={styles.search}
          onPress={() => navigation.navigate('Search')}
          accessibilityRole="search"
          accessibilityLabel="Search for products"
        >
          <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.muted} />
          <Text style={styles.searchPlaceholder}>Search for products</Text>
          <MaterialCommunityIcons name="microphone-outline" size={20} color={theme.colors.muted} />
          <MaterialCommunityIcons name="line-scan" size={20} color={theme.colors.muted} />
        </Pressable>

        {topCategories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catStrip}
          >
            {topCategories.slice(0, 10).map((c) => (
              <Pressable
                key={c.id}
                style={styles.catItem}
                onPress={() => openCategory(c)}
                accessibilityRole="button"
                accessibilityLabel={c.name}
              >
                <View style={styles.catIcon}>
                  <MaterialCommunityIcons
                    name={iconForCategory(c.name)}
                    size={22}
                    color={theme.colors.white}
                  />
                </View>
                <Text style={styles.catLabel} numberOfLines={1}>
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </Gradient>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        <HeroBanner banners={banners.data ?? []} hero={content.hero} onOpenHref={openHref} />

        {dealItems.length > 0 ? (
          <View style={styles.dealsCard}>
            <View style={styles.dealsHead}>
              <Text style={styles.dealsTitle}>Deals on your favourites ✨</Text>
              <Pressable
                onPress={() =>
                  navigation.navigate('ProductList', { sort: 'discount', title: 'Deals for you' })
                }
              >
                <Text style={styles.dealsAll}>View all</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dealsRow}>
              {dealItems.slice(0, 10).map((p) => {
                const pct = discountPct(p);
                return (
                  <Pressable
                    key={p.id}
                    style={styles.dealCard}
                    onPress={() => onPressProduct(p)}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.title}, ${formatInr(p.sellingPrice)}`}
                  >
                    {pct > 0 ? (
                      <View style={styles.dealBadge}>
                        <MaterialCommunityIcons name="arrow-down" size={11} color={theme.colors.white} />
                        <Text style={styles.dealBadgeText}>{pct}%</Text>
                      </View>
                    ) : null}
                    <RemoteImage
                      uri={p.imageUrl}
                      width="100%"
                      height={96}
                      contentFit="contain"
                      fallbackLabel={p.title}
                      radius={theme.radius.sm}
                    />
                    <Text style={styles.dealName} numberOfLines={1}>
                      {p.title}
                    </Text>
                    <Text style={styles.dealPrice}>{formatInr(p.sellingPrice)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

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
          <ProductRail title="Recently viewed" products={recent.data ?? []} onPressProduct={onPressProduct} />
        ) : null}

        {popularItems.length > 0 ? (
          <View style={styles.gridSection}>
            <SectionHeader
              title="Top picks for you"
              onAction={() => navigation.navigate('ProductList', { title: 'All products' })}
            />
            <View style={styles.grid}>
              {popularItems.map((item) => (
                <View key={item.id} style={styles.gridCell}>
                  <ProductCard product={item} onPress={() => onPressProduct(item)} />
                </View>
              ))}
            </View>
          </View>
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
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  logoChip: {
    backgroundColor: theme.colors.white,
    borderRadius: 10,
    padding: 4,
  },
  wordmark: { ...theme.typography.title, color: theme.colors.white },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.xs },
  quickPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  quickText: { ...theme.typography.caption, color: theme.colors.inkStrong, fontWeight: '700' },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pinText: { ...theme.typography.caption, color: theme.colors.white, flexShrink: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    minHeight: 44,
  },
  searchPlaceholder: { ...theme.typography.body, color: theme.colors.muted, flex: 1 },
  catStrip: { gap: theme.spacing.md, paddingTop: theme.spacing.xs, paddingRight: theme.spacing.lg },
  catItem: { alignItems: 'center', gap: 4, width: 60 },
  catIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  catLabel: { ...theme.typography.caption, fontSize: 11, color: theme.colors.white, textAlign: 'center' },
  body: { paddingBottom: theme.spacing.xl },
  dealsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border2,
  },
  dealsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  dealsTitle: { ...theme.typography.bodyLg, fontWeight: '800', color: theme.colors.inkStrong },
  dealsAll: { ...theme.typography.caption, color: theme.colors.primaryStrong, fontWeight: '700' },
  dealsRow: { gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md },
  dealCard: {
    width: 128,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border2,
    padding: theme.spacing.sm,
    gap: 4,
  },
  dealBadge: {
    position: 'absolute',
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.brandStrong,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  dealBadgeText: { ...theme.typography.caption, fontSize: 10, color: theme.colors.white, fontWeight: '800' },
  dealName: { ...theme.typography.caption, color: theme.colors.ink, marginTop: 2 },
  dealPrice: { ...theme.typography.body, color: theme.colors.price, fontWeight: '800' },
  gridSection: { marginTop: theme.spacing.md },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    rowGap: theme.spacing.md,
  },
  gridCell: { width: '48%' },
});
