import { MOBILE_OFFER_ASPECT, type MobileOfferRow } from '@belzo/shared';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { theme } from '@/theme';
import { RemoteImage } from '@/ui/RemoteImage';

const GAP = theme.spacing.sm;

export interface OfferRowsProps {
  /** Rows already filtered for one position (see offerRowsAt). */
  rows: MobileOfferRow[];
  onOpenHref: (href: string | null | undefined) => void;
}

/**
 * Admin-managed offer banners. Each row lays its banners out 1, 2 or 3 per line
 * (extra banners wrap onto the next line) with the same aspect ratios the admin
 * preview uses.
 */
export function OfferRows({ rows, onOpenHref }: OfferRowsProps) {
  const { width } = useWindowDimensions();
  if (rows.length === 0) return null;

  return (
    <View testID="offer-rows">
      {rows.map((row) => {
        const cols = row.columns;
        const cell = Math.floor((width - theme.spacing.lg * 2 - GAP * (cols - 1)) / cols);
        const height = Math.round(cell / MOBILE_OFFER_ASPECT[cols]);
        return (
          <View key={row.id} style={styles.row} testID={`offer-row-${row.id}`}>
            {row.title ? (
              <Text style={styles.title} accessibilityRole="header">
                {row.title}
              </Text>
            ) : null}
            <View style={styles.grid}>
              {row.banners.map((b) => {
                const tappable = b.linkUrl !== '' && b.linkUrl !== '#';
                return (
                  <Pressable
                    key={b.id}
                    disabled={!tappable}
                    onPress={() => onOpenHref(b.linkUrl)}
                    accessibilityRole={tappable ? 'button' : 'image'}
                    accessibilityLabel={b.title || 'Offer'}
                    testID={`offer-banner-${b.id}`}
                  >
                    <RemoteImage
                      uri={b.imageUrl}
                      width={cell}
                      height={height}
                      radius={theme.radius.lg}
                      alt={b.title || 'Offer'}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: theme.spacing.md, paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: theme.colors.inkStrong },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});
