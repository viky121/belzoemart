import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  Animated,
  Easing,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiRequest } from '@/api/client';
import { useLogout } from '@/features/auth/hooks';
import { useProfile } from '@/features/profile/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { useSessionStore } from '@/store/session';
import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { IconButton } from '@/ui/IconButton';
import { RemoteImage } from '@/ui/RemoteImage';
import { useToast } from '@/ui/Toast';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';
import { BrandWordmark } from '@/ui/brand/BrandWordmark';

import { hasCare, hasStore, maskMobile, rateUsUrl, shareMessage, useMenuConfig } from './menu-config';
import { AboutSheet, APP_VERSION, CustomerCareSheet, StoreSheet } from './MenuSheets';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type Nav = NavigationProp<RootStackParamList>;

const SLIDE_MS = 220;

export interface MenuDrawerProps {
  visible: boolean;
  onClose: () => void;
}

type Panel = 'store' | 'care' | 'about' | null;

interface Item {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
}

/**
 * The ☰ menu (Three-Line Menu requirements, 22 Oct 2026): account area, then Home / Profile /
 * Orders / Wishlist / Location, Store Locator / Help / Customer Care, and Terms / Share / Privacy /
 * About, with Logout and the app version at the bottom. Categories are not in this menu; they have
 * their own tab. Destinations that need a sign-in show the usual "Sign in to continue" page.
 */
export function MenuDrawer({ visible, onClose }: MenuDrawerProps) {
  const navigation = useNavigation<Nav>();
  const toast = useToast();
  const logout = useLogout();
  const menu = useMenuConfig();
  const rateUrl = rateUsUrl(menu);
  const [panel, setPanel] = useState<Panel>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  /** Closes the drawer first so a sheet or screen is not stacked on top of it. */
  const leaveThen = (action: () => void) => () => {
    onClose();
    action();
  };

  async function share() {
    onClose();
    let code: string | null = null;
    if (useSessionStore.getState().status === 'authenticated') {
      try {
        code = (await apiRequest<{ code: string }>('/referral/code', { auth: 'required' })).code;
      } catch {
        code = null; // sharing the plain link still works
      }
    }
    try {
      await Share.share({ message: shareMessage(menu, code) });
    } catch {
      toast.show({ message: 'Could not open the share options.', tone: 'error' });
    }
  }

  const items = {
    primary: [
      { key: 'home', icon: 'home-outline', label: 'Home', onPress: leaveThen(() => navigation.navigate('Main', { screen: 'HomeTab' })) },
      { key: 'profile', icon: 'account-outline', label: 'My Profile', onPress: leaveThen(() => navigation.navigate('ProfileEdit')) },
      { key: 'orders', icon: 'package-variant-closed', label: 'My Orders', onPress: leaveThen(() => navigation.navigate('Orders')) },
      { key: 'wishlist', icon: 'heart-outline', label: 'Wishlist', onPress: leaveThen(() => navigation.navigate('Wishlist')) },
    ],
    support: [
      ...(hasStore(menu)
        ? [{ key: 'store', icon: 'storefront-outline' as IconName, label: 'Store Locator', onPress: leaveThen(() => setPanel('store')) }]
        : []),
      { key: 'help', icon: 'help-circle-outline', label: 'Help & Support', onPress: leaveThen(() => navigation.navigate('Help')) },
      ...(hasCare(menu)
        ? [{ key: 'care', icon: 'headset' as IconName, label: 'Customer Care', onPress: leaveThen(() => setPanel('care')) }]
        : []),
    ],
    about: [
      { key: 'terms', icon: 'file-document-outline', label: 'Terms of Use', onPress: leaveThen(() => navigation.navigate('CmsPage', { slug: 'terms' })) },
      { key: 'share', icon: 'share-variant-outline', label: 'Share Belzo eMart', onPress: () => void share() },
      ...(rateUrl
        ? [
            {
              key: 'rate',
              icon: 'star-outline' as IconName,
              label: 'Rate Us',
              onPress: leaveThen(() => void Linking.openURL(rateUrl)),
            },
          ]
        : []),
      { key: 'privacy', icon: 'shield-lock-outline', label: 'Privacy Policy', onPress: leaveThen(() => navigation.navigate('CmsPage', { slug: 'privacy' })) },
      { key: 'about', icon: 'information-outline', label: 'About Belzo eMart', onPress: leaveThen(() => setPanel('about')) },
    ],
  } satisfies Record<string, Item[]>;

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
        {/* The panel only exists while the modal is open, so it slides in fresh every time. */}
        <DrawerPanel
          onClose={onClose}
          groups={[items.primary, items.support, items.about]}
          onLogout={() => {
            onClose();
            setConfirmLogout(true);
          }}
          onLogin={leaveThen(() => navigation.navigate('Login'))}
          onRegister={leaveThen(() => navigation.navigate('Register'))}
          onAddresses={leaveThen(() => navigation.navigate('Addresses'))}
          onProfile={leaveThen(() => navigation.navigate('ProfileEdit'))}
        />
      </Modal>

      <StoreSheet visible={panel === 'store'} onClose={() => setPanel(null)} />
      <CustomerCareSheet visible={panel === 'care'} onClose={() => setPanel(null)} />
      <AboutSheet visible={panel === 'about'} onClose={() => setPanel(null)} />

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
    </>
  );
}

function DrawerPanel({
  onClose,
  groups,
  onLogout,
  onLogin,
  onRegister,
  onAddresses,
  onProfile,
}: {
  onClose: () => void;
  groups: Item[][];
  onLogout: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onAddresses: () => void;
  onProfile: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const brand = useBrand();
  const status = useSessionStore((s) => s.status);
  const sessionCustomer = useSessionStore((s) => s.customer);
  const { data: profile } = useProfile();
  const customer = profile ?? sessionCustomer;
  const isGuest = status !== 'authenticated';
  const hasName = Boolean(customer?.name) && customer?.name !== 'Belzo Customer';

  const drawerWidth = Math.min(Math.round(width * 0.86), 360);
  const [slide] = useState(() => new Animated.Value(-drawerWidth));
  useEffect(() => {
    const anim = Animated.timing(slide, {
      toValue: 0,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [slide]);

  return (
    <View style={styles.root}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
      <Animated.View
        style={[
          styles.drawer,
          { width: drawerWidth, paddingBottom: insets.bottom, transform: [{ translateX: slide }] },
        ]}
        testID="menu-drawer"
      >
        <View style={[styles.head, { backgroundColor: brand.primary, paddingTop: insets.top + 8 }]}>
          <View style={styles.headRow}>
            <View style={styles.headBrand}>
              <View style={styles.logoPill} accessibilityRole="header">
                <BelzoLogo size={32} />
                <BrandWordmark size={19} />
              </View>
            </View>
            <IconButton icon="close" label="Close menu" color={theme.colors.white} onPress={onClose} />
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          {isGuest ? (
            <View style={styles.account}>
              <Pressable
                onPress={onRegister}
                accessibilityRole="button"
                accessibilityLabel="Create Account"
                style={({ pressed }) => [styles.cta, { backgroundColor: brand.primary }, pressed && styles.pressed]}
                testID="menu-register"
              >
                <Text style={styles.ctaText}>Create Account / Join Belzo eMart</Text>
              </Pressable>
              <View style={styles.memberRow}>
                <MaterialCommunityIcons name="account-outline" size={20} color={brand.primary} />
                <Text style={styles.memberText}>Already a Member?</Text>
              </View>
              <Pressable
                onPress={onLogin}
                accessibilityRole="button"
                accessibilityLabel="Login"
                style={({ pressed }) => [styles.loginBtn, { borderColor: brand.primary }, pressed && styles.pressed]}
                testID="menu-login"
              >
                <Text style={[styles.loginText, { color: brand.primary }]}>Login here</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.account}>
              <Pressable
                onPress={onProfile}
                accessibilityRole="button"
                accessibilityLabel="My Profile"
                style={styles.profileRow}
              >
                <View style={[styles.avatar, { backgroundColor: brand.primaryBg }]}>
                  {profile?.photoUrl ? (
                    <RemoteImage uri={profile.photoUrl} width={48} height={48} radius={24} fallbackLabel={customer?.name} />
                  ) : (
                    <MaterialCommunityIcons name="account" size={28} color={brand.primary} />
                  )}
                </View>
                <View style={styles.profileText}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {hasName ? customer?.name : 'Add your name'}
                  </Text>
                  <Text style={styles.profileSub} numberOfLines={1}>
                    {maskMobile(customer?.phone) || customer?.email || ''}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={onAddresses}
                accessibilityRole="button"
                accessibilityLabel="My Addresses"
                style={({ pressed }) => [styles.loginBtn, { borderColor: brand.primary }, pressed && styles.pressed]}
              >
                <Text style={[styles.loginText, { color: brand.primary }]}>My Addresses</Text>
              </Pressable>
            </View>
          )}

          {groups.map((group, gi) => (
            <View key={gi} style={styles.group}>
              {group.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={item.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                  testID={`menu-${item.key}`}
                >
                  <MaterialCommunityIcons name={item.icon} size={22} color={brand.primary} />
                  <Text style={styles.itemLabel}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          ))}

          {!isGuest ? (
            <View style={styles.group}>
              <Pressable
                onPress={onLogout}
                accessibilityRole="button"
                accessibilityLabel="Logout"
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                testID="menu-logout"
              >
                <MaterialCommunityIcons name="logout" size={22} color={theme.colors.danger} />
                <Text style={[styles.itemLabel, { color: theme.colors.danger }]}>Logout</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.version} testID="menu-version">
            Version {APP_VERSION}
          </Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: theme.colors.overlay },
  drawer: {
    height: '100%',
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 16,
  },
  head: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, gap: theme.spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: -theme.spacing.sm },
  headBrand: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flex: 1 },
  logoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingLeft: 4,
    paddingRight: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.white,
  },
  body: { paddingBottom: theme.spacing.xl },
  account: { padding: theme.spacing.lg, gap: theme.spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  cta: { minHeight: 48, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.md },
  ctaText: { fontSize: 14.5, lineHeight: 20, fontWeight: '800', color: theme.colors.white, textAlign: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  memberText: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: theme.colors.inkStrong },
  loginBtn: { minHeight: 42, borderRadius: theme.radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  loginText: { fontSize: 14, lineHeight: 20, fontWeight: '800' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  profileText: { flex: 1, gap: 1 },
  profileName: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: theme.colors.inkStrong },
  profileSub: { ...theme.typography.caption, color: theme.colors.muted },
  group: { paddingVertical: theme.spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  item: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg, minHeight: 50, paddingHorizontal: theme.spacing.lg },
  itemLabel: { fontSize: 15.5, lineHeight: 21, fontWeight: '600', color: theme.colors.inkStrong, flex: 1 },
  pressed: { backgroundColor: theme.colors.surface2, opacity: 0.85 },
  version: { ...theme.typography.caption, color: theme.colors.mutedSoft, padding: theme.spacing.lg },
});
