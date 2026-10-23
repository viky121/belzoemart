import { formatInr } from '@/lib/format-inr';

describe('formatInr', () => {
  it('shows two decimals for fractional amounts', () => {
    expect(formatInr(1006740)).toContain('10,067.40');
    expect(formatInr(47940)).toContain('479.40');
    expect(formatInr(47905)).toContain('479.05');
  });

  it('keeps whole-rupee amounts without decimals', () => {
    const s = formatInr(958800);
    expect(s).toContain('9,588');
    expect(s).not.toContain('.');
  });

  it('formats zero as ₹0', () => {
    expect(formatInr(0)).toBe('₹0');
  });
});
