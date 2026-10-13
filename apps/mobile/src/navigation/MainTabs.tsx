import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { skipToken, useQuery } from '@tanstack/react-query';
import type { ComponentProps } from 'react';

import { qk } from '@/api/query-keys';
import type { CartView } from '@/api/types';
import { CartScreen } from '@/features/cart/screens/CartScreen';
import { CategoriesScreen } from '@/features/categories/screens/CategoriesScreen';
import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { AccountScreen } from '@/features/profile/screens/AccountScreen';
import { useCartIdentity } from '@/store/session';
import { theme } from '@/theme';

import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const ICONS: Record<keyof MainTabParamList, IconName> = {
  HomeTab: 'home-outline',
  CategoriesTab: 'view-grid-outline',
  CartTab: 'cart-outline',
  AccountTab: 'account-outline',
};

/** Active units in the cached cart (no fetch here; the Cart feature owns the query). */
export function cartUnits(view: CartView | undefined): number {
  return (view?.items ?? []).filter((l) => !l.savedForLater).reduce((n, l) => n + l.quantity, 0);
}

function useCartBadge(): number | undefined {
  const identity = useCartIdentity();
  const { data } = useQuery<CartView>({ queryKey: qk.cart(identity), queryFn: skipToken });
  const units = cartUnits(data);
  return units > 0 ? units : undefined;
}

export function MainTabs() {
  const badge = useCartBadge();
  return (
    <Tab.Navigator
      backBehavior="firstRoute"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primaryStrong,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarLabelStyle: { fontSize: 12 },
        tabBarAllowFontScaling: true,
        tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons name={ICONS[route.name]} color={color} size={size} />
        ),
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen
        name="CategoriesTab"
        component={CategoriesScreen}
        options={{ title: 'Categories' }}
      />
      <Tab.Screen
        name="CartTab"
        component={CartScreen}
        options={{
          title: 'Cart',
          tabBarBadge: badge,
          tabBarAccessibilityLabel: badge ? `Cart, ${badge} items` : 'Cart',
        }}
      />
      <Tab.Screen name="AccountTab" component={AccountScreen} options={{ title: 'Account' }} />
    </Tab.Navigator>
  );
}
