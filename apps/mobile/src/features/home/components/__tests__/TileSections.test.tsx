import { fireEvent } from '@testing-library/react-native';
import type { HomeBlock, WhyItem } from '@belzo/shared';

import { renderWithProviders } from '@/test-utils';

import { HomeBlocks } from '../HomeBlocks';
import { WhyGrid } from '../WhyGrid';

const why = (over: Partial<WhyItem> = {}): WhyItem => ({
  icon: '🚚',
  title: 'Fast Delivery',
  sub: 'On time, every time',
  imageUrl: '',
  ...over,
});

const cardsBlock = (): HomeBlock => ({
  type: 'cards',
  id: 'b1',
  title: 'Info',
  enabled: true,
  cards: [
    { icon: '⭐', title: 'Free shipping', subtitle: 'Above ₹300', href: '/category/a', imageUrl: '' },
    { icon: '', title: 'Fresh', subtitle: 'Daily', href: '/category/b', imageUrl: '/api/uploads/banners/b.jpg' },
  ],
});

describe('WhyGrid', () => {
  it('a text point shows its words and no icon, even if an old icon is saved', async () => {
    const ui = await renderWithProviders(<WhyGrid items={[why()]} />);
    expect(ui.getByText('Fast Delivery')).toBeTruthy();
    expect(ui.getByText('On time, every time')).toBeTruthy();
    expect(ui.queryByText('🚚')).toBeNull();
  });

  it('a point with a picture is only the picture, labelled by its title', async () => {
    const ui = await renderWithProviders(<WhyGrid items={[why({ imageUrl: '/api/uploads/banners/a.jpg' })]} />);
    expect(ui.getByTestId('why-image-0')).toBeTruthy();
    expect(ui.getByLabelText('Fast Delivery')).toBeTruthy();
    expect(ui.queryByText('On time, every time')).toBeNull();
  });
});

describe('HomeBlocks cards', () => {
  it('text cards show no icon; picture cards show no text; both open their link', async () => {
    const open = jest.fn();
    const ui = await renderWithProviders(<HomeBlocks blocks={[cardsBlock()]} onOpenHref={open} />);
    expect(ui.getByText('Free shipping')).toBeTruthy();
    expect(ui.queryByText('⭐')).toBeNull();
    expect(ui.getByTestId('card-image-1')).toBeTruthy();
    expect(ui.queryByText('Daily')).toBeNull();

    await fireEvent.press(ui.getByTestId('card-text-0'));
    await fireEvent.press(ui.getByTestId('card-image-1'));
    expect(open).toHaveBeenNthCalledWith(1, '/category/a');
    expect(open).toHaveBeenNthCalledWith(2, '/category/b');
  });
});
