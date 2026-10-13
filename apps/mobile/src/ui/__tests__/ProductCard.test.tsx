import type { ProductCardDto } from '@belzo/shared';
import { formatInr, paise } from '@belzo/shared';
import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils';

import { ProductCard } from '../ProductCard';

const product: ProductCardDto = {
  id: 'p1',
  title: 'Organic Basmati Rice',
  slug: 'organic-basmati-rice',
  imageUrl: '/api/uploads/products/rice.jpg',
  mrp: paise(25_000),
  sellingPrice: paise(19_900),
  discountPct: 20,
  ratingAvg: 4.3,
  ratingCount: 120,
  defaultVariantId: 'v1',
  unit: '1 kg',
};

describe('ProductCard', () => {
  it('renders title, unit, price, struck MRP, discount badge and rating', async () => {
    await renderWithProviders(<ProductCard product={product} onPress={jest.fn()} />);
    expect(screen.getByText('Organic Basmati Rice')).toBeTruthy();
    expect(screen.getByText('1 kg')).toBeTruthy();
    expect(screen.getByText(formatInr(19_900))).toBeTruthy();
    const mrp = screen.getByTestId('price-mrp');
    expect(mrp).toHaveTextContent(formatInr(25_000));
    expect(mrp).toHaveStyle({ textDecorationLine: 'line-through' });
    expect(screen.getByText('20% off')).toBeTruthy();
    expect(screen.getByText('4.3')).toBeTruthy();
  });

  it('has an accessible label with title, unit and price summary', async () => {
    await renderWithProviders(<ProductCard product={product} onPress={jest.fn()} />);
    expect(
      screen.getByLabelText(
        `Organic Basmati Rice, 1 kg, Price ${formatInr(19_900)}, MRP ${formatInr(25_000)}, 20% off`,
      ),
    ).toBeTruthy();
  });

  it('does not strike through or badge when MRP is not higher than price', async () => {
    await renderWithProviders(
      <ProductCard product={{ ...product, mrp: paise(19_900) }} onPress={jest.fn()} />,
    );
    expect(screen.queryByTestId('price-mrp')).toBeNull();
    expect(screen.queryByTestId('discount-badge')).toBeNull();
  });

  it('calls onPress when tapped and onAdd from the Add button', async () => {
    const onPress = jest.fn();
    const onAdd = jest.fn();
    await renderWithProviders(<ProductCard product={product} onPress={onPress} onAdd={onAdd} />);
    await fireEvent.press(screen.getByText('Organic Basmati Rice'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Add Organic Basmati Rice to cart'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('hides the Add button without a defaultVariantId', async () => {
    await renderWithProviders(
      <ProductCard
        product={{ ...product, defaultVariantId: null }}
        onPress={jest.fn()}
        onAdd={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('product-card-add')).toBeNull();
  });
});
