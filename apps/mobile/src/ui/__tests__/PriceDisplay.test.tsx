import { formatInr } from '@belzo/shared';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils';

import { priceA11yLabel, PriceDisplay } from '../PriceDisplay';

describe('PriceDisplay', () => {
  it('shows price, struck MRP and the shared discount percentage', async () => {
    await renderWithProviders(<PriceDisplay price={7_500} mrp={10_000} />, { navigation: false });
    expect(screen.getByText(formatInr(7_500))).toBeTruthy();
    expect(screen.getByTestId('price-mrp')).toHaveTextContent(formatInr(10_000));
    expect(screen.getByText('25% off')).toBeTruthy();
    expect(
      screen.getByLabelText(`Price ${formatInr(7_500)}, MRP ${formatInr(10_000)}, 25% off`),
    ).toBeTruthy();
  });

  it('shows fractional rupees with two decimals', async () => {
    await renderWithProviders(<PriceDisplay price={1_006_740} />, { navigation: false });
    expect(screen.getByText(formatInr(1_006_740))).toBeTruthy();
    expect(formatInr(1_006_740)).toContain('.40');
  });

  it('hides MRP and badge when there is no MRP or it is not higher', async () => {
    await renderWithProviders(<PriceDisplay price={5_000} mrp={null} />, { navigation: false });
    expect(screen.queryByTestId('price-mrp')).toBeNull();
    expect(screen.queryByTestId('discount-badge')).toBeNull();
  });

  it('builds the accessibility label', () => {
    expect(priceA11yLabel(5_000)).toBe(`Price ${formatInr(5_000)}`);
    expect(priceA11yLabel(5_000, 4_000)).toBe(`Price ${formatInr(5_000)}`);
  });
});
