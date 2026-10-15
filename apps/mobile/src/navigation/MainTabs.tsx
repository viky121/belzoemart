import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { skipToken, useQuery } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { qk } from '@/api/query-keys';
import type { CartView } from '@/api/types';
import { CartScreen } from '@/features/cart/screens/CartScreen';
import { CategoriesScreen } from '@/features/categories/screens/CategoriesScreen';
import { PincodeGate } from '@/features/home/components/PincodeGate';
import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { AccountScreen } from '@/features/profile/screens/AccountScreen';
import { useCartIdentity } from '@/store/session';
import { theme } from '@/theme';

import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const ICONS: Record<keyof MainTabParamList, { on: IconName; off: IconName }> = {
  HomeTab: { on: 'home', off: 'home-outline' },
  CategoriesTab: { on: 'view-grid', off: 'view-grid-outline' },
  CartTab: { on: 'cart', off: 'cart-outline' },
  AccountTab: { on: 'account', off: 'account-outline' },
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
    <View style={{ flex: 1 }}>
    <Tab.Navigator
      backBehavior="firstRoute"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primaryStrong,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarAllowFontScaling: true,
        tabBarIcon: ({ color, size, focused }) => (
          <MaterialCommunityIcons
            name={focused ? ICONS[route.name].on : ICONS[route.name].off}
            color={color}
            size={size}
          />
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
      <PincodeGate />
    </View>
  );
}
