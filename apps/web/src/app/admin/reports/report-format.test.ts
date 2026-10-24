import { activePreset, compactMoney, formatCell, pageCount, reportQuery } from './report-format';

describe('report formatting', () => {
  it('shows money in rupees with two decimals and Indian grouping', () => {
    expect(formatCell(12_345_600, 'money')).toBe('₹1,23,456.00');
    expect(formatCell(0, 'money')).toBe('₹0.00');
  });

  it('shows counts, percentages, text and gaps', () => {
    expect(formatCell(1234567, 'int')).toBe('12,34,567');
    expect(formatCell(12.5, 'pct')).toBe('12.5%');
    expect(formatCell('out_for_delivery', 'status')).toBe('out for delivery');
    expect(formatCell(null, 'money')).toBe('—');
    expect(formatCell('', 'text')).toBe('—');
    expect(formatCell(undefined, 'int')).toBe('—');
  });

  it('shortens chart amounts', () => {
    expect(compactMoney(50_000)).toBe('₹500');
    expect(compactMoney(150_000)).toBe('₹1.5k');
    expect(compactMoney(25_000_000)).toBe('₹2.5L');
    expect(compactMoney(2_000_000_000)).toBe('₹2.0Cr');
  });

  it('builds the request query and leaves out empty values', () => {
    expect(reportQuery({ from: '2026-10-01', to: '2026-10-24' })).toBe('from=2026-10-01&to=2026-10-24');
    expect(reportQuery({ from: 'a', to: 'b', status: 'all', page: 1 })).toBe('from=a&to=b');
    expect(reportQuery({ from: 'a', to: 'b', status: 'delivered', page: 3, format: 'csv' })).toBe(
      'from=a&to=b&status=delivered&page=3&format=csv',
    );
  });

  it('recognises the quick filters', () => {
    const now = new Date('2026-10-24T10:00:00Z');
    expect(activePreset('2026-10-18', '2026-10-24', now)).toBe('7d');
    expect(activePreset('2026-10-01', '2026-10-24', now)).toBe('this-month');
    expect(activePreset('2026-10-02', '2026-10-24', now)).toBeNull();
  });

  it('counts pages', () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
  });
});
