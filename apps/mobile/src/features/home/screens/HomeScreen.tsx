import {
  activeBanners,
  getHomeSections,
  mergeHome,
  offerRowsAt,
  resolveMobileCategories,
  type CategoryNodeDto,
  type HomeSection,
  type ProductCardDto,
  type ThemeName,
} from '@belzo/shared';
import { useIsFocused, useNavigation, type NavigationProp } from '@react-navigation/native';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { qk } from '@/api/query-keys';
import type { Banner, CartView } from '@/api/types';
import { UpdateBanner } from '@/features/app-update/UpdateBanner';
import { useCategories } from '@/features/categories/hooks';
import { MenuDrawer } from '@/features/menu/MenuDrawer';
import { useUnreadCount } from '@/features/notifications/hooks';
import { useProducts } from '@/features/products/hooks';
import { useCardCart } from '@/features/cart/use-card-cart';
import { useCardWishlist } from '@/features/wishlist/use-card-wishlist';
import type { RootStackParamList } from '@/navigation/types';
import { usePincodeStore } from '@/store/pincode';
import { useRecentlyViewedStore } from '@/store/recently-viewed';
import { useCartIdentity, useSessionStore } from '@/store/session';
import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { OfflineBanner } from '@/ui/OfflineBanner';
import { ProductCard } from '@/ui/ProductCard';
import { ProductRail } from '@/ui/ProductRail';
import { SectionHeader } from '@/ui/SectionHeader';

import { CategoryShortcuts } from '../components/CategoryShortcuts';
import { HeroBanner } from '../components/HeroBanner';
import { HomeHeader } from '../components/HomeHeader';
import { HomeRail } from '../components/HomeRail';
import { OfferRows } from '../components/OfferRows';
import { PincodeSheet } from '../components/PincodeSheet';
import { useHomeBanners, useMobileHome, useRecentlyViewedProducts, useSettings } from '../hooks';
import { useOpenHref } from '../use-open-href';

type Nav = NavigationProp<RootStackParamList>;

/** Home tab (Belzo eMart design): header, search, banner, category grid, Deals of the Day. */
export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const openHref = useOpenHref();
  const brand = useBrand();
  const focused = useIsFocused();

  const settings = useSettings();
  const banners = useHomeBanners();
  const categories = useCategories();
  const heart = useCardWishlist();
  const cardCart = useCardCart();

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const themeName: ThemeName = settings.data?.theme === 'classic' ? 'classic' : 'emart';
  const content = mergeHome(settings.isError ? 'emart' : themeName, settings.data?.home ?? null);
  const sections = getHomeSections(settings.data?.sections);

  // Admin "Mobile" module. Everything falls back to the previous behaviour when unset.
  const mobileHome = useMobileHome();
  const heroBanners = useMemo<Banner[]>(() => {
    const own = activeBanners(mobileHome.heroBanners);
    if (own.length === 0) return banners.data ?? []; // legacy Marketing banners
    return own.map((b, i) => ({
      id: b.id,
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl === '#' ? null : b.linkUrl,
      title: b.title || null,
      displayOrder: i,
    }));
  }, [mobileHome.heroBanners, banners.data]);
  const categoryTiles = useMemo(
    () => resolveMobileCategories(categories.data ?? [], mobileHome.categories),
    [categories.data, mobileHome.categories],
  );
  const rowsAfterHero = useMemo(() => offerRowsAt(mobileHome.offerRows, 'after_hero'), [mobileHome.offerRows]);
  const rowsAfterCategories = useMemo(
    () => offerRowsAt(mobileHome.offerRows, 'after_categories'),
    [mobileHome.offerRows],
  );
  const rowsAfterDeals = useMemo(() => offerRowsAt(mobileHome.offerRows, 'after_deals'), [mobileHome.offerRows]);

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
    // The top safe-area strip takes the festival gradient's colour so the status bar blends in.
    <SafeAreaView
      style={[styles.root, brand.active && { backgroundColor: brand.headerFrom }]}
      edges={['top', 'left', 'right']}
    >
      <OfflineBanner />
      <HomeHeader
        unread={isCustomer ? unread : undefined}
        cartCount={cartCount}
        pincode={pincode}
        onBell={() => (isCustomer ? navigation.navigate('Notifications') : navigation.navigate('Login'))}
        onCart={() => navigation.navigate('Cart')}
        onSearch={() => navigation.navigate('Search')}
        onPin={() => setPinSheet(true)}
        onMenu={() => setMenuOpen(true)}
        focused={focused}
      />

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        <UpdateBanner />
        <HeroBanner banners={heroBanners} hero={content.hero} onOpenHref={openHref} />
        <OfferRows rows={rowsAfterHero} onOpenHref={openHref} />

        <CategoryShortcuts tiles={categoryTiles} onPressCategory={openCategory} />
        <OfferRows rows={rowsAfterCategories} onOpenHref={openHref} />

        {mobileHome.dealsEnabled && dealItems.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title={mobileHome.dealsTitle}
              onAction={() =>
                navigation.navigate('ProductList', { sort: 'discount', title: mobileHome.dealsTitle })
              }
            />
            <View style={styles.grid}>
              {dealItems.map((item) => (
                <View key={item.id} style={styles.gridCell}>
                  <ProductCard
                    product={item}
                    onPress={() => onPressProduct(item)}
                    wishlisted={heart.isWishlisted(item)}
                    onToggleWishlist={() => heart.onToggle(item)}
                    {...cardCart.cardProps(item)}
                  />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <OfferRows rows={rowsAfterDeals} onOpenHref={openHref} />

        {sections.map((section) => (
          <HomeRail
            key={section.id}
            section={section}
            onPressProduct={onPressProduct}
            onViewAll={onViewAll}
            cardProps={cardCart.cardProps}
          />
        ))}

        {recentIds.length > 0 ? (
          <ProductRail
            title="Recently viewed"
            products={recent.data ?? []}
            onPressProduct={onPressProduct}
            cardProps={cardCart.cardProps}
          />
        ) : null}
      </ScrollView>

      <PincodeSheet visible={pinSheet} onClose={() => setPinSheet(false)} />
      <MenuDrawer
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onChangeLocation={() => setPinSheet(true)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.surface },
  // Light grey page so the white category card and product cards lift off the background.
  scroll: { flex: 1, backgroundColor: theme.colors.bg },
  // Bottom room so the last section clears the floating "View cart" bar.
  body: { paddingTop: theme.spacing.sm, paddingBottom: 96 },
  section: { marginTop: theme.spacing.lg },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    rowGap: theme.spacing.md,
  },
  gridCell: { width: '48.5%' },
});
