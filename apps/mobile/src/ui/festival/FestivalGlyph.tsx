import type { FestivalMotif } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import Svg, { Path } from 'react-native-svg';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Icon-font glyph for every motif except the diya (which is drawn below because the
 * icon set has none). Typed as an exhaustive Record: adding a motif in the shared
 * package fails to compile here until it is mapped, and an invalid icon name fails
 * type-checking.
 */
export const MOTIF_ICON: Record<Exclude<FestivalMotif, 'diya'>, IconName> = {
  firework: 'firework',
  sparkle: 'shimmer',
  palette: 'palette',
  drop: 'water',
  flower: 'flower',
  star: 'star-four-points',
  bow: 'bow-arrow',
  fire: 'fire',
  flag: 'flag-variant',
  bell: 'bell',
  elephant: 'elephant',
  ribbon: 'ribbon',
  heart: 'heart',
  gift: 'gift',
  feather: 'feather',
  om: 'om',
  moon: 'moon-waning-crescent',
  kite: 'kite',
  sun: 'weather-sunny',
  wheat: 'grain',
};

/** A diya (clay lamp with flame), drawn so it works on every device. */
export function Diya({ size, color, flame }: { size: number; color: string; flame: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M2.5 12.5h19c0 4.7-4.2 8-9.5 8s-9.5-3.3-9.5-8z" fill={color} />
      <Path d="M12 2.6c2.3 2.7 3.4 4.6 3.4 6.3a3.4 3.4 0 0 1-6.8 0c0-1.7 1.1-3.6 3.4-6.3z" fill={flame} />
    </Svg>
  );
}

export interface FestivalGlyphProps {
  motif: FestivalMotif;
  size: number;
  /** Main glyph colour. */
  color: string;
  /** Flame colour for the diya. */
  accent?: string;
}

/** One decorative festival glyph. */
export function FestivalGlyph({ motif, size, color, accent = '#fde047' }: FestivalGlyphProps) {
  if (motif === 'diya') return <Diya size={size} color={color} flame={accent} />;
  return <MaterialCommunityIcons name={MOTIF_ICON[motif]} size={size} color={color} />;
}
