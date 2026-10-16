import { FESTIVAL_MOTIFS, FESTIVAL_THEMES, MOBILE_FESTIVALS, sanitizeMobileHome } from '@belzo/shared';
import { act, renderHook, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { HomeHeader } from '@/features/home/components/HomeHeader';
import { festivalValuesFrom } from '@/features/home/FestivalSync';
import { useFestivalStore } from '@/store/festival';
import { renderWithProviders } from '@/test-utils';
import { colors } from '@/theme/tokens';
import { useBrand } from '@/theme/use-brand';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { FestivalDecor } from '@/ui/festival/FestivalDecor';
import { FestivalGlyph, MOTIF_ICON } from '@/ui/festival/FestivalGlyph';

type FestivalId = (typeof MOBILE_FESTIVALS)[number];

async function setFestival(festival: FestivalId, greeting = '', decor = true) {
  await act(async () => {
    useFestivalStore.getState().apply({ festival, greeting, decor });
  });
}

afterEach(async () => {
  await setFestival('none');
});

const bgOf = (el: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(el.props.style as never) as { backgroundColor?: string }).backgroundColor;

describe('useBrand', () => {
  it('with no festival returns exactly the normal app colours', async () => {
    const { result } = await renderHook(() => useBrand());
    expect(result.current.active).toBe(false);
    expect(result.current.primary).toBe(colors.primaryStrong);
    expect(result.current.primaryBg).toBe(colors.primaryBg);
    expect(result.current.greeting).toBe('');
  });

  it.each(MOBILE_FESTIVALS.filter((f) => f !== 'none'))('%s: returns that festival palette', async (id) => {
    await setFestival(id);
    const { result } = await renderHook(() => useBrand());
    const t = FESTIVAL_THEMES[id];
    expect(result.current).toMatchObject({
      active: true,
      primary: t.primary,
      headerFrom: t.headerFrom,
      headerTo: t.headerTo,
      greeting: t.greeting,
    });
  });

  it('uses the admin greeting when set, and honours the decor flag', async () => {
    await setFestival('diwali', 'Shubh Deepawali', false);
    const { result } = await renderHook(() => useBrand());
    expect(result.current.greeting).toBe('Shubh Deepawali');
    expect(result.current.decor).toBe(false);
  });

  it('the store rejects an unknown festival', async () => {
    await act(async () => {
      useFestivalStore.getState().apply({ festival: 'christmas' as never, greeting: '', decor: true });
    });
    expect(useFestivalStore.getState().festival).toBe('none');
  });
});

describe('festivalValuesFrom (settings → store)', () => {
  it('maps the admin config fields', () => {
    const home = sanitizeMobileHome({ festival: 'holi', festivalGreeting: 'Holi Hai', festivalDecor: false });
    expect(festivalValuesFrom(home)).toEqual({ festival: 'holi', greeting: 'Holi Hai', decor: false });
  });
  it('an old API without mobileHome means no festival', () => {
    expect(festivalValuesFrom(sanitizeMobileHome(undefined)).festival).toBe('none');
  });
});

describe('themed components', () => {
  it('Button uses the normal green with no festival', async () => {
    await renderWithProviders(<Button title="Buy" onPress={jest.fn()} testID="b" />, { navigation: false });
    expect(bgOf(screen.getByTestId('b'))).toBe(colors.primaryStrong);
  });

  it('Button and a selected Chip switch to the festival primary', async () => {
    await setFestival('diwali');
    await renderWithProviders(
      <>
        <Button title="Buy" onPress={jest.fn()} testID="b" />
        <Chip label="Sel" selected />
      </>,
      { navigation: false },
    );
    expect(bgOf(screen.getByTestId('b'))).toBe(FESTIVAL_THEMES.diwali.primary);
    expect(bgOf(screen.getByLabelText('Sel'))).toBe(FESTIVAL_THEMES.diwali.primary);
  });
});

describe('festival glyphs', () => {
  it('every shared motif except the diya maps to an icon', () => {
    // MOTIF_ICON is an exhaustive Record (compile-time); this guards the runtime list too.
    for (const m of FESTIVAL_MOTIFS) {
      if (m !== 'diya') expect(MOTIF_ICON[m]).toBeTruthy();
    }
  });

  it('renders each motif, including the custom diya, without crashing', async () => {
    await renderWithProviders(
      <>
        {FESTIVAL_MOTIFS.map((m) => (
          <FestivalGlyph key={m} motif={m} size={20} color="#fff" />
        ))}
      </>,
      { navigation: false },
    );
  });

  it('decor draws nothing when disabled or when there are no motifs', async () => {
    await renderWithProviders(
      <>
        <FestivalDecor motifs={['diya']} color="#fff" accent="#fde047" height={200} enabled={false} />
        <FestivalDecor motifs={[]} color="#fff" accent="#fde047" height={200} enabled />
      </>,
      { navigation: false },
    );
    expect(screen.queryByTestId('festival-decor')).toBeNull();
  });
});

describe('HomeHeader', () => {
  const props = {
    cartCount: 0,
    pincode: '472001',
    onBell: jest.fn(),
    onCart: jest.fn(),
    onSearch: jest.fn(),
    onPin: jest.fn(),
  };

  it('shows no greeting without a festival', async () => {
    await renderWithProviders(<HomeHeader {...props} />, { navigation: false });
    expect(screen.queryByTestId('festival-greeting')).toBeNull();
    expect(screen.getByText('Deliver to 472001')).toBeTruthy();
  });

  it('shows the festival greeting and keeps search working', async () => {
    await setFestival('diwali');
    await renderWithProviders(<HomeHeader {...props} />, { navigation: false });
    expect(screen.getByText('Happy Diwali')).toBeTruthy();
    expect(screen.getByText('शुभ दीपावली')).toBeTruthy();
    expect(screen.getByLabelText('Search for products, brands and more')).toBeTruthy();
  });

  it('shows the admin custom greeting instead of the default', async () => {
    await setFestival('diwali', 'Shubh Deepawali');
    await renderWithProviders(<HomeHeader {...props} />, { navigation: false });
    expect(screen.getByText('Shubh Deepawali')).toBeTruthy();
    expect(screen.queryByText('Happy Diwali')).toBeNull();
  });
});
