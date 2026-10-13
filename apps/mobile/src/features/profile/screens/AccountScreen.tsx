import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import Constants from 'expo-constants';
import { useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '@/navigation/types';
import { useSessionStore } from '@/store/session';
import { theme } from '@/theme';
import { Button, ConfirmDialog, Screen } from '@/ui';

import { useLogout } from '../../auth/hooks';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type Nav = NavigationProp<RootStackParamList>;

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

function MenuRow({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={danger ? theme.colors.danger : theme.colors.primaryStrong}
      />
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.mutedSoft} />
    </Pressable>
  );
}

/** Account tab (design §11 Account): guest menu vs. signed-in customer menu + logout. */
export function AccountScreen() {
  const navigation = useNavigation<Nav>();
  const status = useSessionStore((s) => s.status);
  const customer = useSessionStore((s) => s.customer);
  const logout = useLogout();
  const [confirmLogout, setConfirmLogout] = useState(false);

  const isGuest = status !== 'authenticated';
  const needsName = !customer?.name || customer.name === 'Belzo Customer';

  return (
    <Screen scroll padded>
      {isGuest ? (
        <View style={styles.guestHead}>
          <Text style={styles.title} accessibilityRole="header">
            Welcome to Belzo
          </Text>
          <Text style={styles.muted}>Sign in to track orders, save addresses and more.</Text>
          <Button
            title="Sign in / Create account"
            fullWidth
            onPress={() => navigation.navigate('Login')}
            style={styles.signIn}
            testID="account-signin"
          />
        </View>
      ) : (
        <View style={styles.customerHead}>
          <View style={styles.avatar}>
            <MaterialCommunityIcons name="account" size={32} color={theme.colors.primaryStrong} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.name}>{needsName ? 'Add your name' : customer?.name}</Text>
            <Text style={styles.muted}>{customer?.email ?? customer?.phone ?? ''}</Text>
          </View>
        </View>
      )}

      <View style={styles.menu}>
        {!isGuest ? (
          <>
            <MenuRow icon="package-variant-closed" label="My orders" onPress={() => navigation.navigate('Orders')} />
            <MenuRow icon="heart-outline" label="Wishlist" onPress={() => navigation.navigate('Wishlist')} />
            <MenuRow icon="map-marker-outline" label="Addresses" onPress={() => navigation.navigate('Addresses')} />
            <MenuRow icon="bell-outline" label="Notifications" onPress={() => navigation.navigate('Notifications')} />
            <MenuRow icon="account-edit-outline" label="Edit profile" onPress={() => navigation.navigate('ProfileEdit')} />
            <MenuRow icon="shield-account-outline" label="Privacy & data" onPress={() => navigation.navigate('PrivacyData')} />
          </>
        ) : null}
        <MenuRow icon="help-circle-outline" label="Help" onPress={() => navigation.navigate('Help')} />
        <MenuRow icon="file-document-outline" label="Terms" onPress={() => navigation.navigate('CmsPage', { slug: 'terms' })} />
        <MenuRow icon="lock-outline" label="Privacy Policy" onPress={() => navigation.navigate('CmsPage', { slug: 'privacy' })} />
        {!isGuest ? (
          <MenuRow icon="logout" label="Logout" danger onPress={() => setConfirmLogout(true)} />
        ) : null}
      </View>

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
  guestHead: { gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  title: { ...theme.typography.heading, color: theme.colors.inkStrong },
  muted: { ...theme.typography.body, color: theme.colors.muted },
  signIn: { marginTop: theme.spacing.md },
  customerHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.lg },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  name: { ...theme.typography.title, color: theme.colors.inkStrong },
  menu: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.touch.minTouch,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowPressed: { backgroundColor: theme.colors.primaryBg },
  rowLabel: { ...theme.typography.bodyLg, color: theme.colors.ink, flex: 1 },
  rowLabelDanger: { color: theme.colors.danger },
  version: { ...theme.typography.caption, color: theme.colors.mutedSoft, textAlign: 'center', marginTop: theme.spacing.xl },
});
