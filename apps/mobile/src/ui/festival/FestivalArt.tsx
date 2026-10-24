import type { FestivalMotif, MobileFestival } from '@belzo/shared';
import { StyleSheet, View } from 'react-native';

import { FestivalGlyph } from './FestivalGlyph';

export interface FestivalArtProps {
  festival: MobileFestival;
  motifs: readonly FestivalMotif[];
  /** Colour of the glyph. */
  accent: string;
}

/** Diameter of the badge in the header. */
export const FESTIVAL_ART_SIZE = 52;

/**
 * The small mark shown beside the festival greeting: the festival's first motif (diya, flower,
 * colour palette …) on a soft round badge. No illustrated deities or figures; every festival
 * uses the same quiet treatment.
 */
export function FestivalArt({ motifs, accent }: FestivalArtProps) {
  const first = motifs[0];
  if (!first) return null;
  return (
    <View
      style={styles.wrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="festival-art"
    >
      <View style={styles.badge}>
        <FestivalGlyph motif={first} size={28} color={accent} accent="#fff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: FESTIVAL_ART_SIZE,
    height: FESTIVAL_ART_SIZE,
    borderRadius: FESTIVAL_ART_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});
