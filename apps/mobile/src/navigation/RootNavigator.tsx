import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AddressesScreen } from '@/features/addresses/screens/AddressesScreen';
import { AddressFormScreen } from '@/features/addresses/screens/AddressFormScreen';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { CheckoutScreen } from '@/features/checkout/screens/CheckoutScreen';
import { OrderConfirmationScreen } from '@/features/checkout/screens/OrderConfirmationScreen';
import { CmsPageScreen } from '@/features/content/screens/CmsPageScreen';
import { HelpScreen } from '@/features/content/screens/HelpScreen';
import { NotificationsScreen } from '@/features/notifications/screens/NotificationsScreen';
import { OrderDetailScreen } from '@/features/orders/screens/OrderDetailScreen';
import { OrdersListScreen } from '@/features/orders/screens/OrdersListScreen';
import { ProfileEditScreen } from '@/features/profile/screens/ProfileEditScreen';
import { PrivacyDataScreen } from '@/features/privacy/screens/PrivacyDataScreen';
import { OtpVerifyScreen } from '@/features/auth/screens/OtpVerifyScreen';
import { RegisterScreen } from '@/features/auth/screens/RegisterScreen';
import { OnboardingScreen } from '@/features/onboarding/screens/OnboardingScreen';
import { ImageViewerScreen } from '@/features/products/screens/ImageViewerScreen';
import { ProductDetailScreen } from '@/features/products/screens/ProductDetailScreen';
import { ProductListScreen } from '@/features/products/screens/ProductListScreen';
import { SearchScreen } from '@/features/search/screens/SearchScreen';
import { WishlistScreen } from '@/features/wishlist/screens/WishlistScreen';
import { theme } from '@/theme';

import { MainTabs } from './MainTabs';
import { PlaceholderScreen } from './PlaceholderScreen';
import { withRequireAuth } from './RequireAuth';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Every [auth] route is always registered so deep links resolve for guests (design §2.2).
const ProtectedPlaceholder = withRequireAuth(PlaceholderScreen);
const ProtectedWishlist = withRequireAuth(WishlistScreen);
const ProtectedCheckout = withRequireAuth(CheckoutScreen);
const ProtectedOrderConfirmation = withRequireAuth(OrderConfirmationScreen);
const ProtectedAddresses = withRequireAuth(AddressesScreen);
const ProtectedAddressForm = withRequireAuth(AddressFormScreen);
const ProtectedOrders = withRequireAuth(OrdersListScreen);
const ProtectedOrderDetail = withRequireAuth(OrderDetailScreen);
const ProtectedNotifications = withRequireAuth(NotificationsScreen);
const ProtectedProfileEdit = withRequireAuth(ProfileEditScreen);
const ProtectedPrivacyData = withRequireAuth(PrivacyDataScreen);

export interface RootNavigatorProps {
  initialRouteName: 'Onboarding' | 'Main';
}

/**
 * Root native stack (design §2.1). Routes still rendering PlaceholderScreen are replaced by
 * FEAT-004/005, which then deletes PlaceholderScreen.
 */
export function RootNavigator({ initialRouteName }: RootNavigatorProps) {
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerTintColor: theme.colors.inkStrong,
        headerStyle: { backgroundColor: theme.colors.surface },
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="ProductList"
        component={ProductListScreen}
        options={{ title: 'Products' }}
      />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: '' }} />
      <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Search' }} />
      <Stack.Screen
        name="Checkout"
        component={ProtectedCheckout}
        options={{ title: 'Checkout' }}
      />
      <Stack.Screen
        name="OrderConfirmation"
        component={ProtectedOrderConfirmation}
        options={{ title: 'Order placed', headerBackVisible: false }}
      />
      <Stack.Screen
        name="Orders"
        component={ProtectedOrders}
        options={{ title: 'My orders' }}
      />
      <Stack.Screen
        name="OrderDetail"
        component={ProtectedOrderDetail}
        options={{ title: 'Order details' }}
      />
      <Stack.Screen
        name="Wishlist"
        component={ProtectedWishlist}
        options={{ title: 'Wishlist' }}
      />
      <Stack.Screen
        name="Addresses"
        component={ProtectedAddresses}
        options={{ title: 'Addresses' }}
      />
      <Stack.Screen
        name="Notifications"
        component={ProtectedNotifications}
        options={{ title: 'Notifications' }}
      />
      <Stack.Screen
        name="ProfileEdit"
        component={ProtectedProfileEdit}
        options={{ title: 'Edit profile' }}
      />
      <Stack.Screen
        name="PrivacyData"
        component={ProtectedPrivacyData}
        options={{ title: 'Privacy & data' }}
      />
      <Stack.Screen
        name="DataExportView"
        component={ProtectedPlaceholder}
        options={{ title: 'Your data' }}
      />
      <Stack.Screen name="Help" component={HelpScreen} options={{ title: 'Help' }} />
      <Stack.Screen name="CmsPage" component={CmsPageScreen} options={{ title: '' }} />

      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign in' }} />
        <Stack.Screen name="OtpVerify" component={OtpVerifyScreen} options={{ title: 'Verify' }} />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ title: 'Create account' }}
        />
        <Stack.Screen
          name="AddressForm"
          component={ProtectedAddressForm}
          options={{ title: 'Address' }}
        />
        <Stack.Screen
          name="CancelOrder"
          component={ProtectedPlaceholder}
          options={{ title: 'Cancel order' }}
        />
        <Stack.Screen
          name="ReturnRequest"
          component={ProtectedPlaceholder}
          options={{ title: 'Return items' }}
        />
      </Stack.Group>

      <Stack.Group screenOptions={{ presentation: 'fullScreenModal', headerShown: false }}>
        <Stack.Screen name="ImageViewer" component={ImageViewerScreen} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
