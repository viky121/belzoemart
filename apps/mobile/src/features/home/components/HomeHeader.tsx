import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { Gradient } from '@/ui/Gradient';
import { IconButton } from '@/ui/IconButton';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';
import { BrandWordmark } from '@/ui/brand/BrandWordmark';
import { FestivalDecor } from '@/ui/festival/FestivalDecor';
import { FestivalArt } from '@/ui/festival/FestivalArt';

/** Height the falling decorations travel through (the festive header is about this tall). */
const DECOR_HEIGHT = 150;
const WHITE = theme.colors.white;

export interface HomeHeaderProps {
  /** Unread notifications (signed-in customers only). */
  unread?: number;
  cartCount: number;
  onBell: () => void;
  onCart: () => void;
  onSearch: () => void;
  /** Opens the ☰ menu (button hidden when omitted). */
  onMenu?: () => void;
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
  onBell,
  onCart,
  onSearch,
  onMenu,
  focused = true,
}: HomeHeaderProps) {
  const brand = useBrand();
  const fest = brand.active;
  const iconColor = fest ? WHITE : theme.colors.inkStrong;

  const content = (
    <>
      <View style={styles.row}>
        <View style={[styles.brand, onMenu && styles.brandWithMenu]}>
          {onMenu ? (
            <IconButton icon="menu" label="Open menu" color={iconColor} onPress={onMenu} testID="home-menu" />
          ) : null}
          {/* On the festive gradient the brand sits in a white pill so the logo colours stay true. */}
          <View style={fest ? styles.brandPill : styles.brandPlain}>
            <BelzoLogo size={fest ? 30 : 38} />
            <BrandWordmark size={fest ? 19 : 22} />
          </View>
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
            <Text style={styles.greet} accessibilityRole="header" numberOfLines={1}>
              {brand.greeting}
            </Text>
            {brand.greetingLocal ? (
              <Text style={styles.greetLocal} numberOfLines={1}>
                {brand.greetingLocal}
              </Text>
            ) : null}
          </View>
          <FestivalArt festival={brand.festival} motifs={brand.motifs} accent={brand.accent} />
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
    paddingTop: 2,
    paddingBottom: theme.spacing.md,
    gap: 6,
    overflow: 'hidden',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandWithMenu: { gap: 2, marginLeft: -theme.spacing.sm },
  brandPlain: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingLeft: 4,
    paddingRight: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: WHITE,
  },
  icons: { flexDirection: 'row', alignItems: 'center' },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  greetText: { flex: 1, gap: 1, alignItems: 'flex-start' },
  greet: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: WHITE },
  greetLocal: { fontSize: 12, lineHeight: 16, color: 'rgba(255,255,255,0.92)' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 42,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  searchFestive: { backgroundColor: WHITE, borderColor: WHITE },
  searchText: { ...theme.typography.body, color: theme.colors.muted, flex: 1 },
});
