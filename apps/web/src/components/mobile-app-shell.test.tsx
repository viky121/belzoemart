import { renderToStaticMarkup } from 'react-dom/server';
import type { ProductCardDto } from '@belzo/shared';
import OffersPage from '@/app/(shop)/offers/page';
import CategoriesPage from '@/app/(shop)/categories/page';
import { InfiniteProducts } from './infinite-products';
import { MobileAccountMenu } from './mobile-account-menu';
import { MobileAppShell } from './mobile-app-shell';
import { Toaster } from './toaster';

let pathname = '/';
jest.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock('@/lib/auth-context', () => ({ useAuth: () => ({ accessToken: null, logout: jest.fn() }) }));
jest.mock('@/components/product-card', () => ({
  ProductCard: ({ product }: { product: { id: string; title: string } }) => <article data-testid="card">{product.title}</article>,
}));
const mockProducts = jest.fn();
jest.mock('@/lib/catalogue-api', () => ({
  catalogueApi: {
    categories: () =>
      Promise.resolve([
        { id: 'c1', name: 'Stationery', slug: 'stationery', imageUrl: 'https://cdn.x/s.png', children: [{ name: 'Pens' }, { name: 'Books' }] },
        { id: 'c2', name: 'Grocery', slug: 'grocery', imageUrl: null, children: [] },
      ]),
    products: (qs: string) => mockProducts(qs),
  },
}));

describe('the phone bottom bar', () => {
  it('has the five tabs, the open one marked, and the Cart tab as the target the picture flies to', () => {
    pathname = '/offers';
    const html = renderToStaticMarkup(<MobileAppShell />);
    for (const id of ['home', 'categories', 'offers', 'cart', 'account']) expect(html).toContain(`data-testid="tab-${id}"`);
    expect(html).toMatch(/href="\/offers"[^>]*aria-current="page"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('data-cart-target');
    expect(html).toContain('aria-label="Main"');
  });
  it('shows no pill and no badge while the cart is empty', () => {
    pathname = '/';
    const html = renderToStaticMarkup(<MobileAppShell />);
    expect(html).not.toContain('view-cart-pill');
    expect(html).not.toContain('tab-cart-count');
  });
  it('is not drawn on checkout or while signing in', () => {
    for (const p of ['/checkout', '/login']) {
      pathname = p;
      expect(renderToStaticMarkup(<MobileAppShell />)).toBe('');
    }
  });
});

describe('the Account tab list', () => {
  it('lists the places an account needs, with Logout last', () => {
    const html = renderToStaticMarkup(<MobileAccountMenu />);
    for (const label of ['My Orders', 'Wishlist', 'Addresses', 'Wallet', 'Notifications', 'Help &amp; Support', 'Logout']) {
      expect(html).toContain(label);
    }
    expect(html.indexOf('Logout')).toBeGreaterThan(html.indexOf('Help &amp; Support'));
    expect(html).toContain('href="/wishlist"');
    expect(html).toContain('data-testid="mobile-account-logout"');
  });
});

describe('the Added to cart message', () => {
  it('draws nothing until a message arrives', () => {
    expect(renderToStaticMarkup(<Toaster />)).toBe('');
  });
});

describe('Categories page', () => {
  it('shows every category with its picture or a fallback, and what is inside it', async () => {
    const html = renderToStaticMarkup(await CategoriesPage());
    expect(html).toContain('data-testid="categories-page"');
    expect(html).toContain('href="/category/stationery"');
    expect(html).toContain('src="https://cdn.x/s.png"');
    expect(html).toContain('Pens, Books');
    expect(html).toContain('Shop all products');
    expect(html).toContain('catpg__emoji');
  });
});

const prod = (n: number, discountPct: number) => ({ id: `p${n}`, title: `P${n}`, slug: `p${n}`, discountPct }) as unknown as ProductCardDto;

describe('Offers page', () => {
  it('shows only products that have a discount, with the biggest discount on top', async () => {
    mockProducts.mockResolvedValue({ items: [prod(1, 40), prod(2, 10), prod(3, 0)], total: 3, page: 1, pageSize: 20 });
    const html = renderToStaticMarkup(await OffersPage());
    expect(html).toContain('Up to 40% OFF');
    expect(html.match(/data-testid="card"/g)).toHaveLength(2);
    expect(html).not.toContain('>P3<');
    expect(html).not.toContain('plp-more'); // the list already reached products without a discount
    expect(mockProducts).toHaveBeenCalledWith('sort=discount');
  });
  it('says so when nothing is on offer', async () => {
    mockProducts.mockResolvedValue({ items: [prod(1, 0)], total: 1, page: 1, pageSize: 20 });
    const html = renderToStaticMarkup(await OffersPage());
    expect(html).toContain('data-testid="offers-empty"');
  });
  it('offers more while every product of the page still has a discount', () => {
    const items = [prod(1, 50), prod(2, 40)];
    const html = renderToStaticMarkup(
      <InfiniteProducts initial={{ items, total: 40, page: 1, pageSize: 20 }} endpoint="products" query="sort=discount" testId="g" discountedOnly />,
    );
    expect(html).toContain('plp-more');
  });
});
