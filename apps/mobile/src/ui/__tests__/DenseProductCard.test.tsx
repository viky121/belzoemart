import type { ProductCardDto } from '@belzo/shared';
import { formatInr, paise } from '@belzo/shared';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '@/test-utils';
import { DenseProductCard } from '../DenseProductCard';
import { gridCellWidth, gridColumnsFor } from '../use-grid-columns';

const product: ProductCardDto = {
  id: 'p1',
  title: 'Kangaro HD-10NR Premium Mini Stapler with Staples',
  slug: 'kangaro-hd-10nr',
  imageUrl: '/api/uploads/products/stapler.jpg',
  mrp: paise(8_000),
  sellingPrice: paise(5_401),
  discountPct: 32,
  ratingAvg: 4.3,
  ratingCount: 12,
  defaultVariantId: 'v1',
  unit: '1 pc',
};

describe('DenseProductCard (three in a row)', () => {
  it('shows the title, the unit, the price, the struck MRP and the offer', async () => {
    await renderWithProviders(<DenseProductCard product={product} onPress={jest.fn()} />);
    expect(screen.getByText(product.title)).toBeTruthy();
    expect(screen.getByText('1 pc')).toBeTruthy();
    expect(screen.getByText(formatInr(5_401))).toBeTruthy();
    const mrp = screen.getByTestId('price-mrp');
    expect(mrp).toHaveTextContent(formatInr(8_000));
    expect(mrp).toHaveStyle({ textDecorationLine: 'line-through', fontWeight: '400' });
    expect(screen.getByText('32% OFF')).toBeTruthy();
  });

  it('lets the title take three lines and never limits the price, MRP or offer text', async () => {
    await renderWithProviders(<DenseProductCard product={product} onPress={jest.fn()} />);
    expect(screen.getByText(product.title).props.numberOfLines).toBe(3);
    expect(screen.getByText(formatInr(5_401)).props.numberOfLines).toBeUndefined();
    expect(screen.getByTestId('price-mrp').props.numberOfLines).toBeUndefined();
    expect(screen.getByText('32% OFF').props.numberOfLines).toBeUndefined();
  });

  it('keeps room for three title lines so the cards of a row are the same height', async () => {
    await renderWithProviders(<DenseProductCard product={{ ...product, title: 'Pen' }} onPress={jest.fn()} />);
    expect(screen.getByText('Pen')).toHaveStyle({ minHeight: 45 });
  });

  it('has no MRP and no badge when the price is not below the MRP', async () => {
    await renderWithProviders(<DenseProductCard product={{ ...product, mrp: paise(5_401) }} onPress={jest.fn()} />);
    expect(screen.queryByTestId('price-mrp')).toBeNull();
    expect(screen.queryByTestId('discount-badge')).toBeNull();
  });

  it('has an accessible label with the title, the unit and the price summary', async () => {
    await renderWithProviders(<DenseProductCard product={product} onPress={jest.fn()} />);
    expect(
      screen.getByLabelText(`${product.title}, 1 pc, Price ${formatInr(5_401)}, MRP ${formatInr(8_000)}, 32% off`),
    ).toBeTruthy();
  });

  it('opens the product when tapped and adds it from the Add button', async () => {
    const onPress = jest.fn();
    const onAdd = jest.fn();
    await renderWithProviders(<DenseProductCard product={product} onPress={onPress} onAdd={onAdd} />);
    await fireEvent.press(screen.getByTestId('product-card-add'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText(`${product.title}, 1 pc, Price ${formatInr(5_401)}, MRP ${formatInr(8_000)}, 32% off`));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows a quantity stepper instead of Add once the product is in the cart', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <DenseProductCard product={product} onPress={jest.fn()} onAdd={jest.fn()} quantity={2} onChangeQuantity={onChange} />,
    );
    expect(screen.queryByTestId('product-card-add')).toBeNull();
    await fireEvent.press(screen.getByTestId('product-card-inc'));
    expect(onChange).toHaveBeenCalledWith(3);
    await fireEvent.press(screen.getByTestId('product-card-dec'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('has no Add button for a product without a default variant, and a wishlist heart when asked', async () => {
    const toggle = jest.fn();
    await renderWithProviders(
      <DenseProductCard product={{ ...product, defaultVariantId: null }} onPress={jest.fn()} onAdd={jest.fn()} onToggleWishlist={toggle} />,
    );
    expect(screen.queryByTestId('product-card-add')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Add to wishlist'));
    expect(toggle).toHaveBeenCalled();
  });
});

describe('how many products fit in a row', () => {
  it('is three on a normal phone and two on a very narrow one', () => {
    expect(gridColumnsFor(360)).toBe(3);
    expect(gridColumnsFor(411)).toBe(3);
    expect(gridColumnsFor(339)).toBe(2);
    expect(gridColumnsFor(320)).toBe(2);
  });
  it('drops to two when the phone text is set very large', () => {
    expect(gridColumnsFor(411, 1)).toBe(3);
    expect(gridColumnsFor(411, 1.3)).toBe(3);
    expect(gridColumnsFor(411, 1.5)).toBe(2);
  });
  it('works out the cell width from the padding and the gaps', () => {
    expect(gridCellWidth(360, 3, 12, 8)).toBe(106);
    expect(gridCellWidth(360, 2, 12, 8)).toBe(164);
    // three cells and two gaps never exceed the row
    expect(gridCellWidth(393, 3, 12, 8) * 3 + 16).toBeLessThanOrEqual(393 - 24);
  });
});
