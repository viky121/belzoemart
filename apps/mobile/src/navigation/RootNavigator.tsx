import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { OnboardingScreen } from '@/features/onboarding/screens/OnboardingScreen';
import { theme } from '@/theme';

import { MainTabs } from './MainTabs';
import { PlaceholderScreen } from './PlaceholderScreen';
import { withRequireAuth } from './RequireAuth';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Every [auth] route is always registered so deep links resolve for guests (design §2.2).
const ProtectedPlaceholder = withRequireAuth(PlaceholderScreen);

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
        component={PlaceholderScreen}
        options={{ title: 'Products' }}
      />
      <Stack.Screen name="ProductDetail" component={PlaceholderScreen} options={{ title: '' }} />
      <Stack.Screen name="Search" component={PlaceholderScreen} options={{ title: 'Search' }} />
      <Stack.Screen
        name="Checkout"
        component={ProtectedPlaceholder}
        options={{ title: 'Checkout' }}
      />
      <Stack.Screen
        name="OrderConfirmation"
        component={ProtectedPlaceholder}
        options={{ title: 'Order placed', headerBackVisible: false }}
      />
      <Stack.Screen
        name="Orders"
        component={ProtectedPlaceholder}
        options={{ title: 'My orders' }}
      />
      <Stack.Screen
        name="OrderDetail"
        component={ProtectedPlaceholder}
        options={{ title: 'Order details' }}
      />
      <Stack.Screen
        name="Wishlist"
        component={ProtectedPlaceholder}
        options={{ title: 'Wishlist' }}
      />
      <Stack.Screen
        name="Addresses"
        component={ProtectedPlaceholder}
        options={{ title: 'Addresses' }}
      />
      <Stack.Screen
        name="Notifications"
        component={ProtectedPlaceholder}
        options={{ title: 'Notifications' }}
      />
      <Stack.Screen
        name="ProfileEdit"
        component={ProtectedPlaceholder}
        options={{ title: 'Edit profile' }}
      />
      <Stack.Screen
        name="PrivacyData"
        component={ProtectedPlaceholder}
        options={{ title: 'Privacy & data' }}
      />
      <Stack.Screen
        name="DataExportView"
        component={ProtectedPlaceholder}
        options={{ title: 'Your data' }}
      />
      <Stack.Screen name="Help" component={PlaceholderScreen} options={{ title: 'Help' }} />
      <Stack.Screen name="CmsPage" component={PlaceholderScreen} options={{ title: '' }} />

      <Stack.Group screenOptions={{ presentation: 'modal' }}>
        <Stack.Screen name="Login" component={PlaceholderScreen} options={{ title: 'Sign in' }} />
        <Stack.Screen
          name="OtpVerify"
          component={PlaceholderScreen}
          options={{ title: 'Verify' }}
        />
        <Stack.Screen
          name="Register"
          component={PlaceholderScreen}
          options={{ title: 'Create account' }}
        />
        <Stack.Screen
          name="AddressForm"
          component={ProtectedPlaceholder}
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
        <Stack.Screen name="ImageViewer" component={PlaceholderScreen} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
