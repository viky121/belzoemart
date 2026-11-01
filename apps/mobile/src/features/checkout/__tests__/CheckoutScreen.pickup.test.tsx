import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PICKUP_DEFAULTS, buildPickupDays } from '@belzo/shared';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { __testing, tokenManager } from '@/api/token-manager';
import { useSessionStore } from '@/store/session';
import { createTestQueryClient } from '@/test-utils';
import { ToastProvider } from '@/ui/Toast';
import { CheckoutScreen } from '../screens/CheckoutScreen';

/** Self pickup in the real checkout screen: choose it, choose a day and a time, pay at the shop, place. */
const Stack = createNativeStackNavigator();
// A customer whose PIN code the shop does not deliver to: pickup must still work.
const ADDRESS = { id: 'a1', label: 'home', fullName: 'vikas singh', phone: '9412807767', line1: 'Nine floor', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', isDefault: true, createdAt: '', updatedAt: '' };
const CART = {
  cartId: 'c1',
  items: [{ id: 'l1', variantId: 'v1', productId: 'p1', quantity: 1, savedForLater: false, title: 'Sugar', sku: 'S', unit: '1 kg', imageUrl: null, unitPrice: 2880, basePrice: 2880, mrp: 3000, discountPct: 4, taxRatePct: 5, inStock: true, available: 9, priceSlabs: [], tierQty: 1 }],
  offers: [],
};
const BREAKUP = { subtotal: 2880, discount: 0, shipping: 0, codFee: 0, tax: 137, gst: { cgst: 69, sgst: 68, igst: 0 }, grandTotal: 2880 };
const DAYS = buildPickupDays(PICKUP_DEFAULTS, new Date());
const LAST_DAY = DAYS.at(-1)!;
const SLOT = LAST_DAY.slots[0]!;
const PICKUP = {
  enabled: true,
  note: 'Open every day, ask at the counter',
  shop: { name: 'Belzo eMart', address: 'Brahman colony', city: 'Tikamgarh', state: 'Madhya Pradesh', pincode: '472001', phone: '8839095625' },
  days: DAYS,
};
const reply = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, headers: { get: () => null }, text: () => Promise.resolve(JSON.stringify(body)) });
interface Call { url: string; method: string; body?: string }
function serve(pickup: unknown = PICKUP) {
  const calls: Call[] = [];
  globalThis.fetch = jest.fn((url: string, init?: { method?: string; body?: string }) => {
    const path = String(url).replace(/^.*\/api\/v1/, '').split('?')[0]!;
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body });
    if (path === '/me/addresses') return reply([ADDRESS]);
    if (path === '/cart') return reply(CART);
    if (path === '/checkout/pickup') return reply(pickup);
    if (path === '/checkout/preview') {
      const body = JSON.parse(init?.body ?? '{}') as { fulfilment?: string };
      const isPickup = body.fulfilment === 'pickup';
      return reply({
        breakup: isPickup ? BREAKUP : { ...BREAKUP, shipping: 4000, grandTotal: 6880 },
        coupon: null,
        items: [],
        // Not deliverable to this PIN, but fine for pickup (the server says so).
        serviceable: isPickup,
        fulfilment: isPickup ? 'pickup' : 'delivery',
        codEnabled: true,
        onlinePayment: false,
        shippingWaived: false,
      });
    }
    if (path === '/checkout/place') return reply({ orderId: 'order-77', reused: false, breakup: BREAKUP, payment: { provider: 'cod', amount: 2880 } });
    if (path.startsWith('/orders/')) return reply({ id: 'o1', status: 'confirmed', grandTotal: 2880, payments: [{ provider: 'cod', status: 'pending' }] });
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
              <Stack.Screen name="Addresses" component={() => <Text>ADDRESSES</Text>} />
              <Stack.Screen name="AddressForm" component={() => <Text>ADDRESS FORM</Text>} />
              <Stack.Screen name="OrderConfirmation" component={({ route }: { route: { params?: { orderId?: string; provider?: string } } }) => <Text>CONFIRMED {route.params?.orderId} {route.params?.provider}</Text>} />
            </Stack.Navigator>
          </NavigationContainer>
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

describe('Checkout: self pickup', () => {
  beforeEach(async () => {
    __testing.reset();
    await tokenManager.setSession({ accessToken: 'access-1', expiresIn: 900, refreshToken: 'refresh-1' });
    useSessionStore.setState({ status: 'authenticated', customer: { id: 'c1', name: 'vikas singh', email: null, phone: '9412807767', locale: 'en' } } as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('offers Self pickup, shows the shop and the slots, needs a time, then places a pay-at-shop pickup order', async () => {
    const calls = serve();
    const ui = await render(<Harness />);
    // Home delivery is the normal choice: not deliverable to this PIN, so the order cannot be placed yet.
    await ui.findByText('Self pickup', {}, { timeout: 4000 });
    expect(await ui.findByTestId('checkout-not-serviceable', {}, { timeout: 4000 })).toBeTruthy();
    expect(ui.queryByTestId('pickup-details')).toBeNull();

    await fireEvent.press(ui.getByText('Self pickup'));
    expect(await ui.findByTestId('pickup-details')).toBeTruthy();
    expect(ui.getByText('Belzo eMart')).toBeTruthy();
    expect(ui.getByText('Brahman colony, Tikamgarh, Madhya Pradesh - 472001')).toBeTruthy();
    expect(ui.getByText('Open every day, ask at the counter')).toBeTruthy();
    // The PIN warning is gone, the cash choice says pay at shop, and a time is asked for.
    await waitFor(() => expect(ui.queryByTestId('checkout-not-serviceable')).toBeNull());
    expect(ui.getByText('Pay at shop on pickup')).toBeTruthy();
    expect(ui.getByTestId('pickup-slot-hint')).toBeTruthy();
    const button = ui.getByTestId('place-order');
    await waitFor(() => expect(button.props.accessibilityState?.disabled).toBe(true));

    // Choose the last offered day and its first time slot.
    await fireEvent.press(ui.getByText(LAST_DAY.label));
    await fireEvent.press(ui.getByText(SLOT.label));
    await waitFor(() => expect(ui.queryByTestId('pickup-slot-hint')).toBeNull());
    await waitFor(() => expect(ui.getByTestId('place-order').props.accessibilityState?.disabled).not.toBe(true), { timeout: 4000 });

    await fireEvent.press(ui.getByTestId('place-order'));
    expect(await ui.findByText(/CONFIRMED order-77 cod/, {}, { timeout: 4000 })).toBeTruthy();
    const place = calls.filter((c) => c.url.includes('/checkout/place'));
    expect(place).toHaveLength(1);
    expect(JSON.parse(place[0]!.body!)).toMatchObject({ addressId: 'a1', paymentMethod: 'cod', fulfilment: 'pickup', pickupSlotStart: SLOT.start });
  });

  it('does not offer pickup while the shop has it switched off', async () => {
    serve({ ...PICKUP, enabled: false, days: [] });
    const ui = await render(<Harness />);
    await ui.findByTestId('checkout-not-serviceable', {}, { timeout: 4000 });
    expect(ui.queryByText('Self pickup')).toBeNull();
    expect(ui.getByText('Standard Delivery')).toBeTruthy();
  });

  it('keeps working as home delivery when the pickup information cannot be had', async () => {
    serve({});
    const ui = await render(<Harness />);
    await ui.findByTestId('checkout-not-serviceable', {}, { timeout: 4000 });
    expect(ui.queryByText('Self pickup')).toBeNull();
  });
});
