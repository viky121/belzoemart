import type { StackNavigationState } from '@react-navigation/native';

import { afterAuth } from '../after-auth';
import type { RootStackParamList } from '../types';

type State = StackNavigationState<RootStackParamList>;

function stateOf(routes: { name: keyof RootStackParamList; params?: object }[]): State {
  return {
    key: 'root',
    index: routes.length - 1,
    routeNames: [],
    routes: routes.map((r, i) => ({ key: `${r.name}-${i}`, name: r.name, params: r.params })),
    type: 'stack',
    stale: false,
    preloadedRoutes: [],
  } as unknown as State;
}

type ResetAction = {
  type: string;
  payload: { routes: { name: string; params?: object }[]; index: number };
};

const run = (redirect: Parameters<typeof afterAuth>[0], s: State) =>
  afterAuth(redirect)(s) as unknown as ResetAction;

describe('afterAuth (design §2.4)', () => {
  it('removes Login/OtpVerify/Register and lands on the redirect', () => {
    const s = stateOf([
      { name: 'Main' },
      { name: 'ProductDetail', params: { idOrSlug: 'rice' } },
      { name: 'Login', params: {} },
      { name: 'OtpVerify', params: {} },
    ]);
    const action = run({ name: 'Checkout', params: { addressId: 'a1' } }, s);
    expect(action.type).toBe('RESET');
    expect(action.payload.routes.map((r) => r.name)).toEqual(['Main', 'ProductDetail', 'Checkout']);
    expect(action.payload.routes[2]!.params).toEqual({ addressId: 'a1' });
    expect(action.payload.index).toBe(2);
  });

  it('with no redirect returns to the previous screen', () => {
    const s = stateOf([
      { name: 'Main' },
      { name: 'Orders' },
      { name: 'Login' },
      { name: 'Register' },
    ]);
    const action = run(undefined, s);
    expect(action.payload.routes.map((r) => r.name)).toEqual(['Main', 'Orders']);
    expect(action.payload.index).toBe(1);
  });

  it('lands on Home when nothing is left beneath the auth routes', () => {
    const action = run(undefined, stateOf([{ name: 'Login' }]));
    expect(action.payload.routes.map((r) => r.name)).toEqual(['Main']);
    expect(action.payload.index).toBe(0);
  });

  it('gives the appended redirect a fresh key', () => {
    const action = run({ name: 'Wishlist' }, stateOf([{ name: 'Main' }, { name: 'Login' }]));
    const last = action.payload.routes[1] as { key?: string; name: string };
    expect(last.name).toBe('Wishlist');
    expect(last.key).toMatch(/^Wishlist-\d+$/);
  });
});
