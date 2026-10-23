import { renderToStaticMarkup } from 'react-dom/server';
import { LinkField } from './link-field';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

jest.mock('@/lib/admin-api', () => ({ adminFetch: jest.fn().mockResolvedValue([]) }));

const html = (value: string) => renderToStaticMarkup(<LinkField value={value} onChange={() => undefined} categories={[]} />);

describe('LinkField: selected products', () => {
  it('offers the "Show selected products" action', () => {
    expect(html('#')).toContain('Show selected products');
  });

  it('shows the picker, not the plain text boxes, for a /products link', () => {
    const out = html(`/products?ids=${A}`);
    expect(out).toContain('data-testid="products-link-picker"');
    expect(out).not.toContain('aria-label="Custom link"');
  });

  it('lists each picked product as a numbered row with move and remove buttons', () => {
    const out = html(`/products?ids=${B},${A}&title=Sugar%20offers`);
    expect(out.match(/class="mh-pick__item"/g)).toHaveLength(2);
    expect(out).toContain('2 of 20 products');
    expect(out.match(/aria-label="Remove product"/g)).toHaveLength(2);
    expect(out).toContain('value="Sugar offers"');
  });

  it('asks for at least one product when none is picked', () => {
    expect(html('/products?ids=')).toContain('No products picked yet');
  });

  it('does not show the picker for other tap actions', () => {
    expect(html('#')).not.toContain('products-link-picker');
    expect(html('/search?q=atta')).not.toContain('products-link-picker');
  });
});
