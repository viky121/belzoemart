import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ComponentProps } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useBottomInset } from '@/lib/use-bottom-inset';
import type { CartView } from '@/api/types';
import { ViewCartBar } from '@/features/cart/components/ViewCartBar';
import { CategoriesScreen } from '@/features/categories/screens/CategoriesScreen';
import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { OffersScreen } from '@/features/offers/screens/OffersScreen';
import { AccountScreen } from '@/features/profile/screens/AccountScreen';
import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';

import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const ICONS: Record<keyof MainTabParamList, { on: IconName; off: IconName }> = {
  HomeTab: { on: 'home', off: 'home-outline' },
  CategoriesTab: { on: 'view-grid', off: 'view-grid-outline' },
  OffersTab: { on: 'tag', off: 'tag-outline' },
  AccountTab: { on: 'account', off: 'account-outline' },
};

const tabStyles = StyleSheet.create({
  pill: { width: 52, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

/** Active units in the cached cart (no fetch here; the Cart feature owns the query). */
export function cartUnits(view: CartView | undefined): number {
  return (view?.items ?? []).filter((l) => !l.savedForLater).reduce((n, l) => n + l.quantity, 0);
}

/** Bottom tabs per the Belzo eMart design: Home / Categories / Offers / Account. Cart lives in the header. */
export function MainTabs() {
  const brand = useBrand();
  const bottomInset = useBottomInset();
  const { fontScale } = useWindowDimensions();
  // Edge-to-edge (SDK 57): the system navigation bar draws over the app, so the tab bar has to
  // add the bottom inset itself or Android's back/home/recents buttons sit on top of the tabs.
  // The content height also grows a little with the user's font size so labels never clip.
  const contentHeight = Math.round(56 * Math.min(Math.max(fontScale, 1), 1.3));
  const bottomPad = bottomInset;
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        backBehavior="firstRoute"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: brand.primary,
          tabBarInactiveTintColor: theme.colors.mutedSoft,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
          tabBarItemStyle: { paddingTop: 2 },
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopWidth: 0,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            height: contentHeight + bottomPad,
            paddingTop: 6,
            paddingBottom: bottomPad,
            // Soft shadow lifting the bar off the page (elevation on Android, shadow on iOS).
            elevation: 16,
            shadowColor: '#0f172a',
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -3 },
          },
          tabBarAllowFontScaling: true,
          tabBarIcon: ({ color, size, focused }) => (
            // The active tab gets a soft pill behind its icon, in the brand (or festival) tint.
            <View style={[tabStyles.pill, focused && { backgroundColor: brand.primaryBg }]}>
              <MaterialCommunityIcons
                name={focused ? ICONS[route.name].on : ICONS[route.name].off}
                color={color}
                size={size}
              />
            </View>
          ),
        })}
      >
        <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: 'Home' }} />
        <Tab.Screen name="CategoriesTab" component={CategoriesScreen} options={{ title: 'Categories' }} />
        <Tab.Screen name="OffersTab" component={OffersScreen} options={{ title: 'Offers' }} />
        <Tab.Screen name="AccountTab" component={AccountScreen} options={{ title: 'Account' }} />
      </Tab.Navigator>
      {/* Sibling (not a tab-bar child) so Android still delivers touches outside the bar's bounds. */}
      <ViewCartBar bottom={contentHeight + bottomPad} />
    </View>
  );
}
