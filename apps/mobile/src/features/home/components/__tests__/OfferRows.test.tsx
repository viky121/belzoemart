import { sanitizeMobileHome, offerRowsAt } from '@belzo/shared';
import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils';

import { OfferRows } from '../OfferRows';

function rows(columns: number) {
  return offerRowsAt(
    sanitizeMobileHome({
      offerRows: [
        {
          id: 'r1',
          title: 'Festive offers',
          columns,
          position: 'after_categories',
          banners: [
            { id: 'a', imageUrl: '/api/uploads/banners/a.jpg', linkUrl: '/category/grocery', title: 'Grocery sale' },
            { id: 'b', imageUrl: '/api/uploads/banners/b.jpg' },
            { id: 'c', imageUrl: '/api/uploads/banners/c.jpg', linkUrl: '/search?q=atta', title: 'Atta' },
            { id: 'off', imageUrl: '/api/uploads/banners/d.jpg', enabled: false },
          ],
        },
      ],
    }).offerRows,
    'after_categories',
  );
}

describe('OfferRows', () => {
  it('renders nothing without rows', async () => {
    await renderWithProviders(<OfferRows rows={[]} onOpenHref={jest.fn()} />, { navigation: false });
    expect(screen.queryByTestId('offer-rows')).toBeNull();
  });

  it('shows the row title and only the enabled banners', async () => {
    await renderWithProviders(<OfferRows rows={rows(3)} onOpenHref={jest.fn()} />, { navigation: false });
    expect(screen.getByText('Festive offers')).toBeTruthy();
    expect(screen.getByTestId('offer-banner-a')).toBeTruthy();
    expect(screen.getByTestId('offer-banner-b')).toBeTruthy();
    expect(screen.getByTestId('offer-banner-c')).toBeTruthy();
    expect(screen.queryByTestId('offer-banner-off')).toBeNull();
  });

  it('opens the banner link when tapped', async () => {
    const onOpen = jest.fn();
    await renderWithProviders(<OfferRows rows={rows(2)} onOpenHref={onOpen} />, { navigation: false });
    await fireEvent.press(screen.getByTestId('offer-banner-a'));
    expect(onOpen).toHaveBeenCalledWith('/category/grocery');
    await fireEvent.press(screen.getByTestId('offer-banner-c'));
    expect(onOpen).toHaveBeenLastCalledWith('/search?q=atta');
  });

  it('does not act on a banner without a link', async () => {
    const onOpen = jest.fn();
    await renderWithProviders(<OfferRows rows={rows(2)} onOpenHref={onOpen} />, { navigation: false });
    await fireEvent.press(screen.getByTestId('offer-banner-b'));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
