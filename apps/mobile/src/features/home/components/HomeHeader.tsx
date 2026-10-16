import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { Gradient } from '@/ui/Gradient';
import { IconButton } from '@/ui/IconButton';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';
import { FestivalDecor } from '@/ui/festival/FestivalDecor';
import { FestivalGlyph } from '@/ui/festival/FestivalGlyph';

/** Height the falling decorations travel through (the festive header is about this tall). */
const DECOR_HEIGHT = 230;
const WHITE = theme.colors.white;

export interface HomeHeaderProps {
  /** Unread notifications (signed-in customers only). */
  unread?: number;
  cartCount: number;
  pincode: string | null;
  onBell: () => void;
  onCart: () => void;
  onSearch: () => void;
  onPin: () => void;
  /** Whether the Home tab is on screen (light status-bar icons are only set then). Default true. */
  focused?: boolean;
}

/**
 * Home header. Normally a white bar; while a festival theme is active it becomes a
 * gradient in the festival colours with a greeting and falling decorations.
 */
export function HomeHeader({
  unread,
  cartCount,
  pincode,
  onBell,
  onCart,
  onSearch,
  onPin,
  focused = true,
}: HomeHeaderProps) {
  const brand = useBrand();
  const fest = brand.active;
  const iconColor = fest ? WHITE : theme.colors.inkStrong;

  const content = (
    <>
      <View style={styles.row}>
        <View style={styles.brand}>
          {fest ? (
            <View style={styles.logoChip}>
              <BelzoLogo size={32} />
            </View>
          ) : (
            <BelzoLogo size={38} />
          )}
          <Text style={[styles.wordmark, fest && { color: WHITE }]}>
            Belzo <Text style={[styles.accent, fest && { color: brand.accent }]}>Mart</Text>
          </Text>
        </View>
        <View style={styles.icons}>
          <IconButton icon="bell-outline" label="Notifications" color={iconColor} badge={unread} onPress={onBell} />
          <IconButton
            icon="shopping-outline"
            label={cartCount ? `Cart, ${cartCount} items` : 'Cart'}
            color={iconColor}
            badge={cartCount || undefined}
            onPress={onCart}
          />
        </View>
      </View>

      {fest ? (
        <View style={styles.greetRow} testID="festival-greeting">
          <View style={styles.greetText}>
            <Text style={styles.greet} accessibilityRole="header">
              {brand.greeting}
            </Text>
            {brand.greetingLocal ? <Text style={styles.greetLocal}>{brand.greetingLocal}</Text> : null}
          </View>
          {brand.motifs[0] ? (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <FestivalGlyph motif={brand.motifs[0]} size={46} color={brand.accent} accent={WHITE} />
            </View>
          ) : null}
        </View>
      ) : null}

      <Pressable
        style={[styles.search, fest && styles.searchFestive]}
        onPress={onSearch}
        accessibilityRole="search"
        accessibilityLabel="Search for products, brands and more"
      >
        <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.muted} />
        <Text style={styles.searchText} numberOfLines={1}>
          Search for products, brands and more...
        </Text>
      </Pressable>

      <Pressable
        style={styles.pinRow}
        onPress={onPin}
        accessibilityRole="button"
        accessibilityLabel={pincode ? `Delivering to ${pincode}. Change PIN` : 'Set delivery PIN'}
      >
        <MaterialCommunityIcons
          name="map-marker-outline"
          size={15}
          color={fest ? WHITE : theme.colors.primaryStrong}
        />
        <Text style={[styles.pinText, fest && { color: WHITE }]} numberOfLines={1}>
          {pincode ? `Deliver to ${pincode}` : 'Set delivery PIN'}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={fest ? WHITE : theme.colors.muted} />
      </Pressable>
    </>
  );

  if (!fest) return <View style={styles.plain}>{content}</View>;

  return (
    <Gradient colors={[brand.headerFrom, brand.headerTo]} style={styles.festive}>
      {/* Light status-bar icons over the dark gradient, only while Home is on screen. */}
      {focused ? <StatusBar style="light" /> : null}
      <FestivalDecor
        motifs={brand.motifs}
        color="rgba(255,255,255,0.9)"
        accent={brand.accent}
        height={DECOR_HEIGHT}
        enabled={brand.decor}
      />
      {content}
    </Gradient>
  );
}

const styles = StyleSheet.create({
  plain: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  festive: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoChip: { backgroundColor: WHITE, borderRadius: 12, padding: 3 },
  wordmark: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: theme.colors.inkStrong },
  accent: { color: theme.colors.primaryStrong },
  icons: { flexDirection: 'row', alignItems: 'center' },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  greetText: { flex: 1, gap: 2 },
  greet: { fontSize: 24, lineHeight: 30, fontWeight: '800', color: WHITE },
  greetLocal: { ...theme.typography.body, color: 'rgba(255,255,255,0.92)' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 46,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  searchFestive: { backgroundColor: WHITE, borderColor: WHITE },
  searchText: { ...theme.typography.body, color: theme.colors.muted, flex: 1 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pinText: { ...theme.typography.caption, color: theme.colors.ink, flexShrink: 1, fontWeight: '600' },
});
