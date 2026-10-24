/**
 * Design tokens (design §3.1-3.2). Source: apps/web/src/app/globals.css `:root` plus the live
 * eMart overrides. Filled buttons read only `button.*` (WCAG AA for white 16 sp labels).
 */
export const colors = {
  // Belzo eMart identity: deep-green primary + orange accent (mockup §redesign).
  primary: '#1b7a5e',
  primaryStrong: '#136b53',
  primaryDeep: '#0d5a44',
  brand: '#1b7a5e',
  brandStrong: '#15674f',
  // Selling price renders in dark ink (per mockup); MRP struck through in muted.
  price: '#15223b',
  danger: '#b91c1c',
  dangerSoft: '#ff6161',
  navy: '#15223b',
  ink: '#1b2430',
  inkStrong: '#0f172a',
  muted: '#6b7280',
  mutedSoft: '#8a94a6',
  orange: '#f4601a',
  orangeStrong: '#e2550f',
  yellow: '#ff9f00',
  // Text colours of the official Belzo eMart logo ("Belzo" navy, "eMart" orange).
  logoNavy: '#003270',
  logoOrange: '#ee4700',
  bg: '#f3f5f8',
  surface: '#ffffff',
  surface2: '#f7f9fb',
  border: '#e6e9ee',
  border2: '#eef1f5',
  slate: '#cbd5e1',
  successBg: '#e4f3ea',
  primaryBg: '#e4f3ec',
  accentBg: '#fdeee4',
  dangerBg: '#fdecec',
  warnText: '#9a5a12',
  warnBg: '#fdecd8',
  overlay: 'rgba(15,23,42,0.5)',
  white: '#ffffff',
  black: '#000000',
} as const;

/** The only place Button reads its fill from (see the §3.1 deviation note). */
export const button = {
  primaryFill: colors.primaryStrong,
  accentFill: colors.brandStrong,
} as const;

export const fontWeight = { regular: '400', medium: '500', bold: '700' } as const;

export const typography = {
  caption: { fontSize: 12, lineHeight: 16 },
  body: { fontSize: 14, lineHeight: 20 },
  bodyLg: { fontSize: 16, lineHeight: 22 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: fontWeight.bold },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: fontWeight.bold },
  display: { fontSize: 24, lineHeight: 30, fontWeight: fontWeight.bold },
  price: { fontSize: 18, lineHeight: 24, fontWeight: fontWeight.bold, color: colors.price },
} as const;

/** Dense rows (price rows, tab labels, badges) cap font scaling. */
export const maxFontSizeMultiplier = 1.6;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 4, md: 8, lg: 12, xl: 16, pill: 999 } as const;

export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.06)',
  md: '0 2px 8px rgba(0,0,0,0.08)',
  lg: '0 6px 20px rgba(0,0,0,0.12)',
} as const;

export const touch = { minTouch: 48 } as const;

export const motion = { imageTransitionMs: 150 } as const;
