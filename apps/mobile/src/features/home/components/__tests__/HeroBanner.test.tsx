import { MOBILE_HERO_ASPECT } from '@belzo/shared';
import { Dimensions } from 'react-native';
import { fireEvent } from '@testing-library/react-native';

import type { Banner } from '@/api/types';
import { renderWithProviders } from '@/test-utils';

import { HEIGHT, HeroBanner } from '../HeroBanner';

const hero = { ctaText: 'Shop Now', ctaHref: '/search', imageUrl: null } as never;
const banner = (id: string): Banner =>
  ({ id, title: `Banner ${id}`, imageUrl: `/api/uploads/banners/${id}.png`, linkUrl: '/search' }) as unknown as Banner;

describe('HeroBanner', () => {
  it('is as tall as the recommended 1000 x 400 picture needs, so the picture is not cropped', () => {
    expect(MOBILE_HERO_ASPECT).toBe(2.5);
    const width = Dimensions.get('window').width - 32;
    expect(HEIGHT).toBe(Math.round(width / 2.5));
    // A 1000 x 400 picture scaled to this width is exactly this tall.
    expect(Math.abs((width * 400) / 1000 - HEIGHT)).toBeLessThanOrEqual(0.5);
  });

  it('shows the banner at that height', async () => {
    const ui = await renderWithProviders(<HeroBanner banners={[banner('a')]} hero={hero} onOpenHref={jest.fn()} />);
    expect(ui.getByRole('button', { name: 'Banner a' })).toBeTruthy();
    expect(ui.getByTestId('hero-carousel')).toHaveStyle({ height: HEIGHT });
  });

  it('opens the banner link when tapped', async () => {
    const open = jest.fn();
    const ui = await renderWithProviders(<HeroBanner banners={[banner('a')]} hero={hero} onOpenHref={open} />);
    fireEvent.press(ui.getByRole('button', { name: 'Banner a' }));
    expect(open).toHaveBeenCalledWith('/search');
  });

  it('falls back to the Big Savings card without banners', async () => {
    const ui = await renderWithProviders(<HeroBanner banners={[]} hero={hero} onOpenHref={jest.fn()} />);
    expect(ui.getByText('Big Savings')).toBeTruthy();
  });
});
