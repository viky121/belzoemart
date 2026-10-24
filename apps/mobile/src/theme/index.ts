import {
  button,
  colors,
  fontWeight,
  maxFontSizeMultiplier,
  motion,
  radius,
  shadows,
  spacing,
  touch,
  typography,
} from './tokens';

export const theme = {
  colors,
  button,
  fontWeight,
  typography,
  maxFontSizeMultiplier,
  spacing,
  radius,
  shadows,
  touch,
  motion,
} as const;

export type Theme = typeof theme;
export * from './tokens';
