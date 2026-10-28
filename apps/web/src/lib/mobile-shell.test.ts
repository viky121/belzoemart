import { activeTab, badgeText, cartPillHidden, itemsLabel, tabBarHidden, TABS } from './mobile-shell';
import { flightFrames, FLY_SIZE } from './fly-to-cart';
import { subtitleFor, topDiscount } from './phone-pages';

describe('bottom bar', () => {
  it('has the five places the customer needs, in order', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Home', 'Categories', 'Offers', 'Cart', 'Account']);
    expect(TABS.map((t) => t.href)).toEqual(['/', '/categories', '/offers', '/cart', '/account']);
  });

  it('opens the tab the page belongs to', () => {
    expect(activeTab('/')).toBe('home');
    expect(activeTab('/categories')).toBe('categories');
    expect(activeTab('/category/stationery')).toBe('categories');
    expect(activeTab('/offers')).toBe('offers');
    expect(activeTab('/cart')).toBe('cart');
    for (const p of ['/account', '/orders', '/orders/abc', '/wishlist', '/wallet', '/notifications']) {
      expect(activeTab(p)).toBe('account');
    }
  });

  it('opens no tab on pages that belong to none, and does not confuse similar paths', () => {
    expect(activeTab('/product/some-oil')).toBeNull();
    expect(activeTab('/search')).toBeNull();
    expect(activeTab('/cartoon')).toBeNull();
    expect(activeTab('/categorylist')).toBeNull();
  });

  it('is left out on checkout, sign-in and the order result', () => {
    for (const p of ['/checkout', '/login', '/signup', '/forgot-password', '/order-result']) {
      expect(tabBarHidden(p)).toBe(true);
    }
    for (const p of ['/', '/cart', '/orders', '/product/x']) expect(tabBarHidden(p)).toBe(false);
  });

  it('hides the View cart pill there too, and on the cart page itself', () => {
    expect(cartPillHidden('/checkout')).toBe(true);
    expect(cartPillHidden('/cart')).toBe(true);
    expect(cartPillHidden('/')).toBe(false);
    expect(cartPillHidden('/product/x')).toBe(true); // a product page has its own Add to cart bar
    expect(cartPillHidden('/offers')).toBe(false);
  });

  it('words the item count and the badge', () => {
    expect(itemsLabel(1)).toBe('1 item');
    expect(itemsLabel(4)).toBe('4 items');
    expect(badgeText(0)).toBeNull();
    expect(badgeText(7)).toBe('7');
    expect(badgeText(100)).toBe('99+');
  });
});

describe('flightFrames', () => {
  const from = { left: 20, top: 400, width: 120, height: 120 };
  const to = { left: 280, top: 780, width: 52, height: 30 };
  it('starts on the middle of the product picture and ends on the middle of the Cart tab', () => {
    const frames = flightFrames(from, to);
    expect(frames[0]).toMatchObject({ transform: 'translate(0px, 0px) scale(1)', opacity: 1 });
    const fromMid = { x: 20 + 60, y: 400 + 60 };
    const toMid = { x: 280 + 26, y: 780 + 15 };
    expect(frames[2]!.transform).toBe(`translate(${toMid.x - fromMid.x}px, ${toMid.y - fromMid.y}px) scale(0.18)`);
    expect(FLY_SIZE).toBeGreaterThan(0);
  });
  it('shrinks and fades on the way', () => {
    const frames = flightFrames(from, to);
    expect(frames).toHaveLength(3);
    expect(frames[2]!.opacity).toBeLessThan(frames[0]!.opacity as number);
  });
});

describe('Categories and Offers helpers', () => {
  it('shows up to three sub-category names, or invites to shop all', () => {
    const kid = (name: string) => ({ name }) as never;
    expect(subtitleFor({ children: [kid('A'), kid('B'), kid('C'), kid('D')] })).toBe('A, B, C');
    expect(subtitleFor({ children: [] })).toBe('Shop all products');
  });
  it('finds the biggest discount', () => {
    expect(topDiscount([{ discountPct: 5 }, { discountPct: 35 }, { discountPct: 0 }])).toBe(35);
    expect(topDiscount([])).toBe(0);
  });
});
