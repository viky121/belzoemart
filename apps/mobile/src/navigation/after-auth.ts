import { CommonActions, type StackNavigationState } from '@react-navigation/native';

import type { RedirectTarget, RootStackParamList } from './types';

export const AUTH_ROUTES: readonly string[] = ['Login', 'OtpVerify', 'Register'];

/**
 * Pure state transform used after a successful sign-in (design §2.4): drop the auth routes, append
 * the redirect (if any) and land on it; with no redirect the user returns to the previous screen.
 * Usage: `navigation.dispatch(afterAuth(redirect))`.
 */
export function afterAuth(redirect?: RedirectTarget) {
  return (state: StackNavigationState<RootStackParamList>) => {
    const routes = state.routes.filter((r) => !AUTH_ROUTES.includes(r.name));
    if (redirect) {
      routes.push({
        key: `${redirect.name}-${Date.now()}`,
        name: redirect.name,
        params: redirect.params,
      } as never);
    }
    if (routes.length === 0) {
      // Signed in from a cold deep link with nothing beneath: land on Home.
      routes.push({
        key: `Main-${Date.now()}`,
        name: 'Main',
        params: { screen: 'HomeTab' },
      } as never);
    }
    return CommonActions.reset({ ...state, routes, index: routes.length - 1 });
  };
}
