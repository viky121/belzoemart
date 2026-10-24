import { renderToStaticMarkup } from 'react-dom/server';
import AdminReportsPage from './page';

jest.mock('@/lib/admin-api', () => ({
  adminFetch: jest.fn().mockResolvedValue(null),
  adminDownload: jest.fn().mockResolvedValue(undefined),
}));

describe('Admin Reports page', () => {
  const html = renderToStaticMarkup(<AdminReportsPage />);

  it('has a tab for every report, the GST tab, and marks profit and loss as Super Admin only', () => {
    for (const id of ['sales', 'orders', 'users', 'products', 'categories', 'brands', 'best-sellers', 'payments', 'profit-loss', 'gst']) {
      expect(html).toContain(`data-testid="report-tab-${id}"`);
    }
    expect(html).toContain('title="Super Admin only"');
    expect(html).not.toContain('Purchasing');
  });

  it('offers the quick date filters, with the last 30 days chosen first', () => {
    for (const label of ['Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'This month', 'Last month']) {
      expect(html).toContain(label);
    }
    expect(html).toMatch(/class="rep-chip is-on"[^>]*aria-pressed="true"[^>]*>Last 30 days/);
    expect(html).toContain('type="date"');
  });

  it('opens on the Sales tab', () => {
    const tag = (id: string) => new RegExp(`<button[^>]*data-testid="report-tab-${id}"[^>]*>`).exec(html)?.[0] ?? '';
    expect(tag('sales')).toContain('aria-selected="true"');
    expect(tag('orders')).toContain('aria-selected="false"');
    expect(html).toContain('Loading report');
  });
});
