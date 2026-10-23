import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused, useNavigation, type NavigationProp } from '@react-navigation/native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppUpdate } from '@/features/app-update/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { useSessionStore } from '@/store/session';
import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { Card, ConfirmDialog, Screen } from '@/ui';
import { Gradient } from '@/ui/Gradient';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';
import { RemoteImage } from '@/ui/RemoteImage';

import { useLogout } from '../../auth/hooks';
import { useProfile } from '../hooks';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type Nav = NavigationProp<RootStackParamList>;

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** Two initials (or one) from a display name, for the avatar. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return (parts[0]!.charAt(0) + (parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '')).toUpperCase();
}

function MenuRow({
  icon,
  label,
  onPress,
  danger,
  last,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const brand = useBrand();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <View
        style={[
          styles.rowIcon,
          { backgroundColor: danger ? theme.colors.dangerBg : brand.primaryBg },
        ]}
      >
        <MaterialCommunityIcons name={icon} size={20} color={danger ? theme.colors.danger : brand.primary} />
      </View>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.mutedSoft} />
    </Pressable>
  );
}

function QuickTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const brand = useBrand();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, pressed && styles.rowPressed]}
    >
      <View style={[styles.tileIcon, { backgroundColor: brand.primaryBg }]}>
        <MaterialCommunityIcons name={icon} size={24} color={brand.primary} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

/** Account tab (design §11 Account): gradient profile header, quick links, grouped menus and logout. */
export function AccountScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const brand = useBrand();
  const status = useSessionStore((s) => s.status);
  const sessionCustomer = useSessionStore((s) => s.customer);
  // The fresh profile wins; the copy saved at login can be stale (name added on the web, etc.).
  const { data: profile } = useProfile();
  const customer = profile ?? sessionCustomer;
  const photoUrl = profile?.photoUrl ?? null;
  const logout = useLogout();
  const update = useAppUpdate();
  const [confirmLogout, setConfirmLogout] = useState(false);

  const isGuest = status !== 'authenticated';
  const needsName = !customer?.name || customer.name === 'Belzo Customer';
  const initials = needsName ? '' : initialsOf(customer?.name ?? '');

  return (
    <Screen scroll edges={['left', 'right']}>
      {focused ? <StatusBar style="light" /> : null}
      <Gradient colors={[brand.headerFrom, brand.headerTo]} style={[styles.hero, { paddingTop: insets.top + 20 }]}>
        {isGuest ? (
          <View style={styles.guest}>
            <View style={styles.logoChip}>
              <BelzoLogo size={44} />
            </View>
            <Text style={styles.heroTitle} accessibilityRole="header">
              Welcome to Belzo
            </Text>
            <Text style={styles.heroSub}>Sign in to track orders, save addresses and more.</Text>
            <Pressable
              onPress={() => navigation.navigate('Login')}
              accessibilityRole="button"
              accessibilityLabel="Sign in / Create account"
              style={({ pressed }) => [styles.signIn, pressed && styles.rowPressed]}
              testID="account-signin"
            >
              <Text style={[styles.signInText, { color: brand.primary }]}>Sign in / Create account</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.profile}
            onPress={() => navigation.navigate('ProfileEdit')}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
          >
            <View style={styles.avatar}>
              {photoUrl ? (
                <RemoteImage uri={photoUrl} width={58} height={58} radius={29} fallbackLabel={customer?.name} />
              ) : initials ? (
                <Text style={[styles.avatarText, { color: brand.primary }]}>{initials}</Text>
              ) : (
                <MaterialCommunityIcons name="account" size={34} color={brand.primary} />
              )}
            </View>
            <View style={styles.flex}>
              <Text style={styles.heroName} numberOfLines={1}>
                {needsName ? 'Add your name' : customer?.name}
              </Text>
              <Text style={styles.heroSub} numberOfLines={1}>
                {customer?.email ?? customer?.phone ?? ''}
              </Text>
            </View>
            <View style={styles.editChip}>
              <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.colors.white} />
              <Text style={styles.editText}>Edit</Text>
            </View>
          </Pressable>
        )}
      </Gradient>

      {!isGuest ? (
        <Card flush style={styles.quickCard}>
          <View style={styles.quick}>
            <QuickTile icon="package-variant-closed" label="Orders" onPress={() => navigation.navigate('Orders')} />
            <QuickTile icon="heart-outline" label="Wishlist" onPress={() => navigation.navigate('Wishlist')} />
            <QuickTile icon="map-marker-outline" label="Addresses" onPress={() => navigation.navigate('Addresses')} />
          </View>
        </Card>
      ) : null}

      {!isGuest ? (
        <Card flush>
          <MenuRow icon="bell-outline" label="Notifications" onPress={() => navigation.navigate('Notifications')} />
          <MenuRow icon="account-edit-outline" label="Edit profile" onPress={() => navigation.navigate('ProfileEdit')} />
          <MenuRow
            icon="shield-account-outline"
            label="Privacy & data"
            onPress={() => navigation.navigate('PrivacyData')}
            last
          />
        </Card>
      ) : null}

      <Card flush>
        {update.canDownload ? (
          <MenuRow
            icon="cellphone-arrow-down"
            label={update.updateAvailable ? `Download new app (v${update.latest})` : 'Download latest app'}
            onPress={update.download}
          />
        ) : null}
        <MenuRow icon="help-circle-outline" label="Help" onPress={() => navigation.navigate('Help')} />
        <MenuRow icon="file-document-outline" label="Terms" onPress={() => navigation.navigate('CmsPage', { slug: 'terms' })} />
        <MenuRow
          icon="lock-outline"
          label="Privacy Policy"
          onPress={() => navigation.navigate('CmsPage', { slug: 'privacy' })}
          last
        />
      </Card>

      {!isGuest ? (
        <Card flush>
          <MenuRow icon="logout" label="Logout" danger onPress={() => setConfirmLogout(true)} last />
        </Card>
      ) : null}

      <Text style={styles.version}>Belzo eMart v{APP_VERSION}</Text>

      <ConfirmDialog
        visible={confirmLogout}
        title="Log out?"
        body="You will need to sign in again to see your orders and wishlist."
        confirmLabel="Log out"
        destructive
        busy={logout.isPending}
        onConfirm={() => logout.mutate(undefined, { onSettled: () => setConfirmLogout(false) })}
        onCancel={() => setConfirmLogout(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 44,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  guest: { alignItems: 'center', gap: theme.spacing.sm },
  logoChip: { backgroundColor: theme.colors.white, borderRadius: 20, padding: 6 },
  heroTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: theme.colors.white },
  heroSub: { fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.88)', textAlign: 'center' },
  signIn: {
    marginTop: theme.spacing.sm,
    minHeight: 46,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInText: { fontSize: 15, lineHeight: 20, fontWeight: '800' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  avatarText: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  heroName: { fontSize: 19, lineHeight: 25, fontWeight: '800', color: theme.colors.white },
  editChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  editText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: theme.colors.white },
  // Pulls the quick-links card up over the bottom of the gradient.
  quickCard: { marginTop: -28 },
  quick: { flexDirection: 'row', paddingVertical: theme.spacing.md },
  tile: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: theme.spacing.xs },
  tileIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 12.5, lineHeight: 17, fontWeight: '700', color: theme.colors.inkStrong },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.touch.minTouch + 4,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  rowPressed: { opacity: 0.7 },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { ...theme.typography.bodyLg, color: theme.colors.inkStrong, flex: 1, fontWeight: '600' },
  rowLabelDanger: { color: theme.colors.danger },
  version: {
    ...theme.typography.caption,
    color: theme.colors.mutedSoft,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
});
