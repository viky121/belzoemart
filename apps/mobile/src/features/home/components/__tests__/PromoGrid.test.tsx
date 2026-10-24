import { fireEvent } from '@testing-library/react-native';
import type { PromoContent } from '@belzo/shared';

import { renderWithProviders } from '@/test-utils';

import { PromoGrid } from '../PromoGrid';

const tile = (over: Partial<PromoContent> = {}): PromoContent => ({
  title: 'Fresh Groceries',
  subtitle: 'From farm to your home',
  cta: 'Shop Now',
  href: '/category/grocery',
  icon: '🥦',
  color: 'green',
  imageUrl: '',
  ...over,
});

describe('PromoGrid', () => {
  it('a text tile shows its text and no icon, even if an old icon is saved', async () => {
    const ui = await renderWithProviders(<PromoGrid promos={[tile()]} onOpenHref={jest.fn()} />);
    expect(ui.getByText('Fresh Groceries')).toBeTruthy();
    expect(ui.getByText('Shop Now →')).toBeTruthy();
    expect(ui.queryByText('🥦')).toBeNull();
  });

  it('a tile with a picture is only the picture: no title, text or button drawn', async () => {
    const ui = await renderWithProviders(
      <PromoGrid promos={[tile({ imageUrl: '/api/uploads/banners/a.jpg' })]} onOpenHref={jest.fn()} />,
    );
    expect(ui.getByTestId('promo-image-0')).toBeTruthy();
    expect(ui.queryByText('Shop Now →')).toBeNull();
    expect(ui.queryByText('From farm to your home')).toBeNull();
    expect(ui.getByLabelText('Fresh Groceries')).toBeTruthy();
  });

  it('tapping either kind of tile opens its link', async () => {
    const open = jest.fn();
    const ui = await renderWithProviders(
      <PromoGrid
        promos={[tile({ href: '/category/a' }), tile({ href: '/category/b', imageUrl: '/b.jpg' })]}
        onOpenHref={open}
      />,
    );
    await fireEvent.press(ui.getByTestId('promo-text-0'));
    await fireEvent.press(ui.getByTestId('promo-image-1'));
    expect(open).toHaveBeenNthCalledWith(1, '/category/a');
    expect(open).toHaveBeenNthCalledWith(2, '/category/b');
  });

  it('treats "#" as no picture', async () => {
    const ui = await renderWithProviders(<PromoGrid promos={[tile({ imageUrl: '#' })]} onOpenHref={jest.fn()} />);
    expect(ui.queryByTestId('promo-image-0')).toBeNull();
    expect(ui.getByTestId('promo-text-0')).toBeTruthy();
  });
});
