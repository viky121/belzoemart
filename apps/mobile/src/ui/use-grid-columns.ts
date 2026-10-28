import { useWindowDimensions } from 'react-native';

/** A phone narrower than this (in dp) keeps 2 products in a row: three would be too squeezed to read. */
export const DENSE_MIN_WIDTH = 340;
/** With the phone's text size set bigger than this, 2 in a row keeps titles and prices from being cut. */
export const DENSE_MAX_FONT_SCALE = 1.3;

/** How many products fit in a row: 3 on a normal phone, 2 on a very narrow one or with very large text. */
export function gridColumnsFor(width: number, fontScale = 1): 2 | 3 {
  return width >= DENSE_MIN_WIDTH && fontScale <= DENSE_MAX_FONT_SCALE ? 3 : 2;
}

export function useGridColumns(): 2 | 3 {
  const { width, fontScale } = useWindowDimensions();
  return gridColumnsFor(width, fontScale);
}

/** Width of one product cell for a row of `cols`, with `pad` at each side of the row and `gap` between cells. */
export function gridCellWidth(width: number, cols: number, pad: number, gap: number): number {
  return Math.floor((width - pad * 2 - gap * (cols - 1)) / cols);
}
