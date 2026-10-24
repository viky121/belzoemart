import {
  PRODUCTS_LINK_MAX,
  cleanProductIds,
  parseProductsLink,
  productsLinkHref,
} from './product-link';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('productsLinkHref / parseProductsLink', () => {
  it('round-trips ids (in order) and the title', () => {
    const href = productsLinkHref([B, A], 'Festive & fresh');
    expect(href).toBe(`/products?ids=${B},${A}&title=Festive%20%26%20fresh`);
    expect(parseProductsLink(href)).toEqual({ ids: [B, A], title: 'Festive & fresh' });
  });

  it('works without a title', () => {
    expect(parseProductsLink(productsLinkHref([A]))).toEqual({ ids: [A], title: '' });
  });

  it('is not tappable ("#") when there is no valid id', () => {
    expect(productsLinkHref([])).toBe('#');
    expect(productsLinkHref(['not-an-id', '1; drop table'])).toBe('#');
  });

  it('drops invalid and duplicate ids and caps the list', () => {
    expect(cleanProductIds([A, 'x', A.toUpperCase(), B])).toEqual([A, B]);
    const many = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(cleanProductIds(many)).toHaveLength(PRODUCTS_LINK_MAX);
  });

  it('parses a link with a host, and ignores other paths', () => {
    expect(parseProductsLink(`https://belzoemart.com/products?ids=${A}`)).toEqual({ ids: [A], title: '' });
    expect(parseProductsLink('/search?q=atta')).toBeNull();
    expect(parseProductsLink('/products')).toBeNull();
    expect(parseProductsLink(`/products?ids=bad`)).toBeNull();
    expect(parseProductsLink(null)).toBeNull();
  });

  it('survives a malformed title escape', () => {
    expect(parseProductsLink(`/products?ids=${A}&title=%E0%A4%A`)).toEqual({ ids: [A], title: '' });
  });
});
