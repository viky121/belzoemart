import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import type { CartView } from '@/api/types';
import { CategoriesScreen } from '@/features/categories/screens/CategoriesScreen';
import { PincodeGate } from '@/features/home/components/PincodeGate';
import { HomeScreen } from '@/features/home/screens/HomeScreen';
import { OffersScreen } from '@/features/offers/screens/OffersScreen';
import { AccountScreen } from '@/features/profile/screens/AccountScreen';
import { theme } from '@/theme';

import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const ICONS: Record<keyof MainTabParamList, { on: IconName; off: IconName }> = {
  HomeTab: { on: 'home', off: 'home-outline' },
  CategoriesTab: { on: 'view-grid', off: 'view-grid-outline' },
  OffersTab: { on: 'tag', off: 'tag-outline' },
  AccountTab: { on: 'account', off: 'account-outline' },
};

/** Active units in the cached cart (no fetch here; the Cart feature owns the query). */
export function cartUnits(view: CartView | undefined): number {
  return (view?.items ?? []).filter((l) => !l.savedForLater).reduce((n, l) => n + l.quantity, 0);
}

/** Bottom tabs per the Belzo Mart design: Home / Categories / Offers / Account. Cart lives in the header. */
export function MainTabs() {
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        backBehavior="firstRoute"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primaryStrong,
          tabBarInactiveTintColor: theme.colors.mutedSoft,
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
        <Tab.Screen name="CategoriesTab" component={CategoriesScreen} options={{ title: 'Categories' }} />
        <Tab.Screen name="OffersTab" component={OffersScreen} options={{ title: 'Offers' }} />
        <Tab.Screen name="AccountTab" component={AccountScreen} options={{ title: 'Account' }} />
      </Tab.Navigator>
      <PincodeGate />
    </View>
  );
}
