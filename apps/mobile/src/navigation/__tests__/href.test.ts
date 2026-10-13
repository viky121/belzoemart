import { hrefToRoute } from '../href';

const API = 'http://13.48.85.9';

describe('hrefToRoute (design §2.7)', () => {
  it.each<[string | null | undefined, unknown]>([
    [null, null],
    [undefined, null],
    ['', null],
    ['#', null],
    ['  ', null],
    ['/', { kind: 'route', name: 'Main', params: { screen: 'HomeTab' } }],
    ['/search?q=rice', { kind: 'route', name: 'Search', params: { q: 'rice' } }],
    [
      '/search?q=basmati+rice&sort=newest',
      { kind: 'route', name: 'Search', params: { q: 'basmati rice', sort: 'newest' } },
    ],
    [
      '/search?q=%E0%A4%9A%E0%A4%BE%E0%A4%B5%E0%A4%B2',
      { kind: 'route', name: 'Search', params: { q: 'चावल' } },
    ],
    [
      '/search',
      { kind: 'route', name: 'ProductList', params: { sort: 'relevance', title: 'All products' } },
    ],
    [
      '/search?sort=popularity',
      { kind: 'route', name: 'ProductList', params: { sort: 'popularity', title: 'All products' } },
    ],
    [
      '/search?sort=bogus',
      { kind: 'route', name: 'ProductList', params: { sort: 'relevance', title: 'All products' } },
    ],
    [
      '/category/staples',
      { kind: 'route', name: 'ProductList', params: { categorySlug: 'staples' } },
    ],
    [
      '/category/staples/',
      { kind: 'route', name: 'ProductList', params: { categorySlug: 'staples' } },
    ],
    [
      '/product/organic-rice',
      { kind: 'route', name: 'ProductDetail', params: { idOrSlug: 'organic-rice' } },
    ],
    [
      '/page/privacy-policy',
      { kind: 'route', name: 'CmsPage', params: { slug: 'privacy-policy' } },
    ],
    ['/cart', { kind: 'route', name: 'Main', params: { screen: 'CartTab' } }],
    ['/wishlist', { kind: 'route', name: 'Wishlist' }],
    ['/orders', { kind: 'route', name: 'Orders' }],
    ['/orders/abc-123', { kind: 'route', name: 'OrderDetail', params: { id: 'abc-123' } }],
    ['/notifications', { kind: 'route', name: 'Notifications' }],
    ['/account', { kind: 'route', name: 'Main', params: { screen: 'AccountTab' } }],
    [
      '/product/organic-rice#reviews',
      { kind: 'route', name: 'ProductDetail', params: { idOrSlug: 'organic-rice' } },
    ],
    [
      'http://13.48.85.9/category/staples',
      { kind: 'route', name: 'ProductList', params: { categorySlug: 'staples' } },
    ],
    ['HTTP://13.48.85.9/', { kind: 'route', name: 'Main', params: { screen: 'HomeTab' } }],
    ['http://13.48.85.9', { kind: 'route', name: 'Main', params: { screen: 'HomeTab' } }],
    ['https://13.48.85.9/search?q=dal', { kind: 'route', name: 'Search', params: { q: 'dal' } }],
    ['http://13.48.85.9/admin', null],
    ['https://example.com/offer', { kind: 'external', url: 'https://example.com/offer' }],
    ['http://other.example.org/x', { kind: 'external', url: 'http://other.example.org/x' }],
    ['/admin/products', null],
    ['/category', null],
    ['/category/a/b', null],
    ['/cart/x', null],
    ['//evil.example.com/x', null],
    ['mailto:help@example.com', null],
    ['javascript:alert(1)', null],
    ['relative/path', null],
  ])('%p', (href, expected) => {
    expect(hrefToRoute(href, API)).toEqual(expected);
  });

  it('matches the host of the configured base URL including the port', () => {
    expect(hrefToRoute('http://10.0.2.2:4000/cart', 'http://10.0.2.2:4000')).toEqual({
      kind: 'route',
      name: 'Main',
      params: { screen: 'CartTab' },
    });
    expect(hrefToRoute('http://10.0.2.2/cart', 'http://10.0.2.2:4000')).toEqual({
      kind: 'external',
      url: 'http://10.0.2.2/cart',
    });
  });
});
