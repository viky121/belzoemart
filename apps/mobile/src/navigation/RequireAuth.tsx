import { useNavigation, useRoute, type NavigationProp } from '@react-navigation/native';
import type { ComponentType, ReactNode } from 'react';

import { useSessionStore } from '@/store/session';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';

import type { RedirectTarget, RootStackParamList } from './types';

/** Protected-screen wrapper (design §2.2): guests see a sign-in prompt that returns here. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useSessionStore((s) => s.status);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute();
  if (status === 'authenticated') return <>{children}</>;
  const redirect = {
    name: route.name as keyof RootStackParamList,
    params: route.params as object | undefined,
  };
  return (
    <Screen>
      <EmptyState
        icon="account-lock-outline"
        title="Sign in to continue"
        body="Please sign in to see this page."
        action={{ label: 'Sign in', onPress: () => navigation.navigate('Login', { redirect }) }}
      />
    </Screen>
  );
}

/** HOC used when registering [auth] routes. */
export function withRequireAuth<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  function Protected(props: P) {
    return (
      <RequireAuth>
        <Component {...props} />
      </RequireAuth>
    );
  }
  Protected.displayName = `RequireAuth(${Component.displayName ?? Component.name ?? 'Screen'})`;
  return Protected;
}

/**
 * Protected actions (Checkout CTA, wishlist heart, coupon apply, Buy now): customers navigate
 * directly; guests go to Login with the target as redirect.
 */
export function requireAuth(
  navigation: NavigationProp<RootStackParamList>,
  target: RedirectTarget,
): void {
  if (useSessionStore.getState().status === 'authenticated') {
    (navigation.navigate as (name: string, params?: object) => void)(target.name, target.params);
  } else {
    navigation.navigate('Login', { redirect: target });
  }
}
