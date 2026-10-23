import { act, configure, fireEvent, screen } from '@testing-library/react-native';

import { useSessionStore } from '@/store/session';
import { renderWithProviders } from '@/test-utils';

import { MenuDrawer } from '../MenuDrawer';

// No network in tests: the menu then falls back to the customer saved in the session.
jest.mock('@/features/profile/hooks', () => ({ useProfile: () => ({ data: undefined }) }));

// The drawer sits inside a transparent Modal with a scrim; query it the way a user sees it.
configure({ defaultIncludeHiddenElements: true });

async function renderMenu() {
  const props = { visible: true, onClose: jest.fn(), onChangeLocation: jest.fn() };
  await renderWithProviders(<MenuDrawer {...props} />);
  return { props };
}

describe('MenuDrawer', () => {
  beforeEach(async () => {
    await act(async () => {
      useSessionStore.getState().setGuest();
    });
  });

  it('shows the account prompts for a guest and no categories', async () => {
    await renderMenu();
    expect(screen.getByTestId('menu-register')).toBeTruthy();
    expect(screen.getByTestId('menu-login')).toBeTruthy();
    expect(screen.queryByText('All Categories')).toBeNull();
    expect(screen.queryByTestId('menu-logout')).toBeNull();
  });

  it('lists the required menu items', async () => {
    await renderMenu();
    for (const label of [
      'Home',
      'My Profile',
      'My Orders',
      'Wishlist',
      'Change Location',
      'Store Locator',
      'Help & Support',
      'Customer Care',
      'Terms of Use',
      'Share Belzo eMart',
      'Privacy Policy',
      'About Belzo eMart',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('hides Rate Us until the app has a store listing', async () => {
    await renderMenu();
    expect(screen.queryByLabelText('Rate Us')).toBeNull();
  });

  it('shows the app version', async () => {
    await renderMenu();
    expect(screen.getByTestId('menu-version')).toHaveTextContent(/^Version \d/);
  });

  it('closes and asks the screen to open the location sheet', async () => {
    const { props } = await renderMenu();
    await fireEvent.press(screen.getByTestId('menu-location'));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onChangeLocation).toHaveBeenCalled();
  });

  it('shows the customer, a masked number and Logout once signed in', async () => {
    await act(async () => {
      useSessionStore.getState().setAuthenticated({
        id: 'c1',
        name: 'Kapil Jain',
        email: null,
        phone: '9821792101',
        locale: 'en',
      });
    });
    await renderMenu();
    expect(screen.getByText('Kapil Jain')).toBeTruthy();
    expect(screen.getByText('98••••2101')).toBeTruthy();
    expect(screen.getByTestId('menu-logout')).toBeTruthy();
    expect(screen.queryByTestId('menu-register')).toBeNull();
  });
});
