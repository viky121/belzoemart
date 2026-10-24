import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { __testing, tokenManager } from '@/api/token-manager';
import { useSessionStore } from '@/store/session';
import { createTestQueryClient } from '@/test-utils';
import { ToastProvider } from '@/ui/Toast';
import { CheckoutScreen } from '../screens/CheckoutScreen';

/**
 * The bug: after "Place Order" the order WAS created, but the screen would not move to the confirmation page
 * (navigation was blocked by the "placing your order" guard) and only showed "Placing your order…".
 * This runs the real screen inside a real stack navigator.
 */
const Stack = createNativeStackNavigator();
const ADDRESS = { id: 'a1', label: 'home', fullName: 'vikas singh', phone: '9412807767', line1: 'Nine floor', city: 'Tikamgarh', state: 'Madhya Pradesh', pincode: '472001', isDefault: true, createdAt: '', updatedAt: '' };
const CART = {
  cartId: 'c1',
  items: [{ id: 'l1', variantId: 'v1', productId: 'p1', quantity: 1, savedForLater: false, title: 'Sugar', sku: 'S', unit: '1 kg', imageUrl: null, unitPrice: 2880, basePrice: 2880, mrp: 3000, discountPct: 4, taxRatePct: 5, inStock: true, available: 9, priceSlabs: [], tierQty: 1 }],
  offers: [],
};
const BREAKUP = { subtotal: 2880, discount: 0, shipping: 0, codFee: 0, tax: 137, gst: { cgst: 69, sgst: 68, igst: 0 }, grandTotal: 2880 };
const PREVIEW = { breakup: BREAKUP, coupon: null, items: [], serviceable: true, codEnabled: true, onlinePayment: true, shippingWaived: false };

const reply = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });

interface Call { url: string; method: string; body?: string }
function serve(place: () => Promise<unknown>) {
  const calls: Call[] = [];
  globalThis.fetch = jest.fn((url: string, init?: { method?: string; body?: string }) => {
    const path = String(url).replace(/^.*\/api\/v1/, '').split('?')[0]!;
    const method = init?.method ?? 'GET';
    calls.push({ url: String(url), method, body: init?.body });
    if (path === '/me/addresses') return reply([ADDRESS]);
    if (path === '/cart') return reply(CART);
    if (path === '/checkout/preview') return reply(PREVIEW);
    if (path === '/checkout/place') return place();
    if (path.startsWith('/orders/')) return reply({ id: 'o1', status: 'pending', grandTotal: 2880, payments: [{ provider: 'cod', status: 'pending' }] });
    return reply({});
  }) as unknown as typeof fetch;
  return calls;
}

function Harness() {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={createTestQueryClient()}>
        <ToastProvider>
          <NavigationContainer>
            <Stack.Navigator initialRouteName="Checkout" screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Main" component={() => <Text>MAIN SCREEN</Text>} />
              <Stack.Screen name="Checkout" component={CheckoutScreen as never} />
              <Stack.Screen name="AddressForm" component={() => <Text>ADDRESS FORM</Text>} />
              <Stack.Screen name="OrderConfirmation" component={({ route }: { route: { params?: { orderId?: string; provider?: string } } }) => <Text>CONFIRMED {route.params?.orderId} {route.params?.provider}</Text>} />
            </Stack.Navigator>
          </NavigationContainer>
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

describe('Checkout: Cash on Delivery', () => {
  beforeEach(async () => {
    __testing.reset();
    await tokenManager.setSession({ accessToken: 'access-1', expiresIn: 900, refreshToken: 'refresh-1' });
    useSessionStore.setState({ status: 'authenticated', customer: { id: 'c1', name: 'vikas singh', email: null, phone: '9412807767', locale: 'en' } } as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('places the order and moves to the confirmation page (it must not get stuck on "Placing your order")', async () => {
    const calls = serve(() => reply({ orderId: 'order-123', reused: false, breakup: BREAKUP, payment: { provider: 'cod', amount: 2880 } }));
    const ui = await render(<Harness />);
    const button = await ui.findByTestId('place-order', {}, { timeout: 4000 });
    await waitFor(() => expect(button.props.accessibilityState?.disabled).not.toBe(true), { timeout: 4000 });
    await fireEvent.press(button);
    expect(await ui.findByText(/CONFIRMED order-123 cod/, {}, { timeout: 4000 })).toBeTruthy();
    expect(ui.queryByText('Placing your order…')).toBeNull();
    const place = calls.filter((c) => c.url.includes('/checkout/place'));
    expect(place).toHaveLength(1);
    expect(JSON.parse(place[0]!.body!)).toMatchObject({ addressId: 'a1', paymentMethod: 'cod' });
  });

  it('shows the reason and stays on the page when the server refuses the order', async () => {
    serve(() => reply({ statusCode: 400, error: 'BadRequestException', message: 'Cash on Delivery is currently unavailable.' }, 400));
    const ui = await render(<Harness />);
    const button = await ui.findByTestId('place-order', {}, { timeout: 4000 });
    await waitFor(() => expect(button.props.accessibilityState?.disabled).not.toBe(true), { timeout: 4000 });
    await fireEvent.press(button);
    expect(await ui.findByText(/Cash on Delivery is currently unavailable/, {}, { timeout: 4000 })).toBeTruthy();
    expect(ui.queryByText(/CONFIRMED/)).toBeNull();
  });
});
