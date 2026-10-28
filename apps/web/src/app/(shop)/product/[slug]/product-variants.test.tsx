import { renderToStaticMarkup } from 'react-dom/server';
import { ProductVariants } from './product-variants';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/auth-context', () => ({ useAuth: () => ({ accessToken: null }) }));
jest.mock('@/lib/offers-api', () => ({ fetchActiveOffers: () => Promise.resolve([]) }));
jest.mock('@/lib/cart-api', () => ({ cartApi: { add: jest.fn() } }));

const variant = (over: Record<string, unknown> = {}) =>
  ({
    id: 'v1',
    sku: 'OIL-1',
    attributes: {},
    mrp: 20000,
    sellingPrice: 15000,
    inStock: true,
    priceSlabs: [],
    ...over,
  }) as never;

describe('product page: the phone bar with Add to cart', () => {
  it('has the price, the old price, Add to cart and Buy now', () => {
    const html = renderToStaticMarkup(<ProductVariants variants={[variant()]} />);
    expect(html).toContain('data-testid="pdp-sticky-bar"');
    expect(html).toContain('data-testid="pdp-sticky-add"');
    expect(html).toContain('data-testid="pdp-sticky-buy"');
    expect(html).toMatch(/stickybuy__price"><strong>₹150(\.00)?<\/strong><s>₹200(\.00)?<\/s>/);
    expect(html).toContain('Add to cart');
    expect(html).toContain('Buy now');
  });
  it('shows no old price when there is no discount', () => {
    const html = renderToStaticMarkup(<ProductVariants variants={[variant({ mrp: 15000 })]} />);
    expect(html).not.toMatch(/stickybuy__price"><strong>[^<]*<\/strong><s>/);
  });
  it('is switched off while the product is out of stock', () => {
    const html = renderToStaticMarkup(<ProductVariants variants={[variant({ inStock: false })]} />);
    expect(html).toMatch(/data-testid="pdp-sticky-add"[^>]*disabled|disabled=""[^>]*data-testid="pdp-sticky-add"/);
    expect(html).toContain('Out of stock');
  });
  it('keeps the normal buy box on the page for a computer', () => {
    const html = renderToStaticMarkup(<ProductVariants variants={[variant()]} />);
    expect(html).toContain('data-testid="pdp-add-to-cart"');
    expect(html).toContain('data-testid="pdp-buy-now"');
  });
});
