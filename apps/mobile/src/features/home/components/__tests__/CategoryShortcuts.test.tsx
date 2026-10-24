import { fireEvent } from '@testing-library/react-native';
import type { CategoryNodeDto, MobileCategoryTile } from '@belzo/shared';
import { renderWithProviders } from '@/test-utils';
import { CategoryShortcuts, VISIBLE_TILES, tileWidthFor } from '../CategoryShortcuts';

const node = (id: string, name: string): CategoryNodeDto =>
  ({ id, name, slug: id, parentId: null, imageUrl: null, children: [] }) as unknown as CategoryNodeDto;
const tile = (id: string, name: string): MobileCategoryTile => ({ id, name, iconUrl: null, node: node(id, name) });

const NAMES = ['Home Care', 'Grocery', 'Personal Care', 'Baby Care', 'Beverages', 'Stationery', 'Health & OTC', 'Bettry & Cell', 'Packaged Food'];

describe('CategoryShortcuts', () => {
  it('puts every category in one sideways-sliding row, with none left over below', async () => {
    const tiles = NAMES.map((n, i) => tile(`c${i}`, n));
    const ui = await renderWithProviders(<CategoryShortcuts tiles={tiles} onPressCategory={jest.fn()} />);
    const slider = ui.getByTestId('category-slider');
    expect(slider.props.horizontal).toBe(true);
    expect(slider.props.showsHorizontalScrollIndicator).toBe(false);
    for (const n of NAMES) expect(ui.getByLabelText(n)).toBeTruthy();
  });

  it('a category added later simply joins the same slider', async () => {
    const before = NAMES.map((n, i) => tile(`c${i}`, n));
    const first = await renderWithProviders(<CategoryShortcuts tiles={before} onPressCategory={jest.fn()} />);
    expect(first.queryByLabelText('Dry Fruits')).toBeNull();
    const after = await renderWithProviders(
      <CategoryShortcuts tiles={[...before, tile('new', 'Dry Fruits')]} onPressCategory={jest.fn()} />,
    );
    expect(after.getByLabelText('Dry Fruits')).toBeTruthy();
    expect(after.getByTestId('category-tile-new')).toBeTruthy();
  });

  it('tapping a tile opens that category', async () => {
    const open = jest.fn();
    const ui = await renderWithProviders(<CategoryShortcuts tiles={[tile('g', 'Grocery')]} onPressCategory={open} />);
    fireEvent.press(ui.getByTestId('category-tile-g'));
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 'g', name: 'Grocery' }));
  });

  it('draws nothing without categories', async () => {
    const ui = await renderWithProviders(<CategoryShortcuts tiles={[]} onPressCategory={jest.fn()} />);
    expect(ui.queryByTestId('category-slider')).toBeNull();
  });
});

describe('tileWidthFor', () => {
  it('shows four tiles and half of the next one, so the slide is visible', () => {
    expect(VISIBLE_TILES).toBe(4.5);
    const w = tileWidthFor(400, 40);
    expect(w).toBe(80);
    expect(w * VISIBLE_TILES).toBeLessThanOrEqual(360);
  });
  it('never gets too narrow on a small screen', () => {
    expect(tileWidthFor(200, 40)).toBe(68);
  });
});
