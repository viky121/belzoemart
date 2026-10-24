import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { StyleSheet, Text } from 'react-native';
import { renderWithProviders } from '@/test-utils';
import { Screen } from '../Screen';

const bottomPad = (ui: Awaited<ReturnType<typeof renderWithProviders>>) =>
  StyleSheet.flatten(ui.getByTestId('screen-body').props.style).paddingBottom;

describe('Screen keeps its content above the system navigation bar', () => {
  it('by default, so the last button is never hidden under the back/home buttons', async () => {
    const ui = await renderWithProviders(<Screen><Text>Save</Text></Screen>, { navigation: false });
    expect(bottomPad(ui)).toBeGreaterThanOrEqual(8);
  });

  it('also for scrolling forms', async () => {
    const ui = await renderWithProviders(<Screen scroll padded><Text>Save</Text></Screen>, { navigation: false });
    expect(bottomPad(ui)).toBeGreaterThanOrEqual(8);
  });

  it('not when the screen draws its own bottom bar (it pads it itself)', async () => {
    const ui = await renderWithProviders(<Screen bottom="none"><Text>x</Text></Screen>, { navigation: false });
    expect(bottomPad(ui)).toBe(0);
  });

  it('not inside the bottom tabs, where the tab bar already does it', async () => {
    const ui = await renderWithProviders(
      <BottomTabBarHeightContext.Provider value={56}>
        <Screen><Text>x</Text></Screen>
      </BottomTabBarHeightContext.Provider>,
      { navigation: false },
    );
    expect(bottomPad(ui)).toBe(0);
  });

  it('not when it already asks for the bottom safe-area edge', async () => {
    const ui = await renderWithProviders(<Screen edges={['top', 'bottom']}><Text>x</Text></Screen>, { navigation: false });
    expect(bottomPad(ui)).toBe(0);
  });
});
