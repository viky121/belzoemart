import { renderToStaticMarkup } from 'react-dom/server';
import { activeFilterCount, isPanelOpen } from '@/lib/filter-state';
import { FilterSidebar } from './filter-sidebar';

let search = '';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const brands = [
  { id: 'b1', name: 'Ajay', slug: 'ajay' },
  { id: 'b2', name: 'Amina', slug: 'amina' },
] as never;
const categories = [{ id: 'c1', name: 'Grocery', slug: 'grocery' }];
const render = () => renderToStaticMarkup(<FilterSidebar basePath="/search" categories={categories} brands={brands} />);

describe('FilterSidebar on a phone', () => {
  beforeEach(() => {
    search = '';
  });

  it('shows a Filters button first, and keeps the panel closed until it is tapped', () => {
    const html = render();
    expect(html).toContain('data-testid="filters-open"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('plp-filters--open');
    expect(html).not.toContain('plp-scrim');
    expect(html).not.toContain('role="dialog"');
  });

  it('shows how many filters are on, with a quick Clear next to the button', () => {
    search = 'q=oil&brandId=b1&minPrice=50000&maxPrice=100000';
    const html = render();
    expect(html).toMatch(/data-testid="filters-count">2</);
    expect(html).toContain('data-testid="filters-clear-bar"');
    expect(html).toContain('href="/search?q=oil"');
  });

  it('has no count or Clear when nothing is filtered', () => {
    const html = render();
    expect(html).not.toContain('filters-count');
    expect(html).not.toContain('filters-clear-bar');
  });

  it('every choice is a link that keeps the other filters, and the panel has Close and Show results', () => {
    search = 'q=oil&minPrice=50000';
    const html = render();
    expect(html).toContain('href="/search?q=oil&amp;minPrice=50000&amp;brandId=b1"');
    expect(html).toContain('data-testid="filters-close"');
    expect(html).toContain('data-testid="filters-apply"');
    expect(html).toContain('Show results');
  });

  it('choosing the brand that is already on turns it off', () => {
    search = 'brandId=b1';
    expect(render()).toContain('data-testid="filter-brand-ajay"');
    expect(render()).toContain('href="/search"');
  });
});

describe('filter panel state', () => {
  it('counts a brand and a price band as one filter each', () => {
    expect(activeFilterCount(new URLSearchParams(''))).toBe(0);
    expect(activeFilterCount(new URLSearchParams('brandId=b1'))).toBe(1);
    expect(activeFilterCount(new URLSearchParams('minPrice=50000'))).toBe(1);
    expect(activeFilterCount(new URLSearchParams('maxPrice=100000'))).toBe(1);
    expect(activeFilterCount(new URLSearchParams('brandId=b1&minPrice=1&maxPrice=2&q=x&sort=price_asc'))).toBe(2);
  });

  it('is open only for the exact filters it was opened on, so any choice closes it', () => {
    expect(isPanelOpen(null, '')).toBe(false);
    expect(isPanelOpen('q=oil', 'q=oil')).toBe(true);
    expect(isPanelOpen('q=oil', 'q=oil&brandId=b1')).toBe(false); // a brand was chosen
    expect(isPanelOpen('q=oil&brandId=b1', 'q=oil')).toBe(false); // the brand was turned off
    expect(isPanelOpen('', '')).toBe(true); // opened with no filters at all
    expect(isPanelOpen('', 'brandId=b1')).toBe(false);
  });
});
