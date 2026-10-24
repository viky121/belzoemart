import { menuAddressLines, menuTelHref } from '@belzo/shared';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import type { ComponentProps } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';
import { useBrand } from '@/theme/use-brand';
import { Sheet } from '@/ui/Sheet';
import { useToast } from '@/ui/Toast';
import { BelzoLogo } from '@/ui/brand/BelzoLogo';

import { careActions, hasCare, useMenuConfig } from './menu-config';

export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Opens a URL (tel:, mailto:, https:) and tells the user when the phone cannot. */
function useOpenLink() {
  const toast = useToast();
  return async (url: string, failure: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      toast.show({ message: failure, tone: 'error' });
    }
  };
}

function ActionRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress: () => void;
}) {
  const brand = useBrand();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <View style={[styles.actionIcon, { backgroundColor: brand.primaryBg }]}>
        <MaterialCommunityIcons name={icon} size={22} color={brand.primary} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionLabel}>{label}</Text>
        {value ? (
          <Text style={styles.actionValue} numberOfLines={2}>
            {value}
          </Text>
        ) : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.mutedSoft} />
    </Pressable>
  );
}

export interface MenuSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Customer Care: call, WhatsApp and email, using the details set in the admin panel. */
export function CustomerCareSheet({ visible, onClose }: MenuSheetProps) {
  const open = useOpenLink();
  const menu = useMenuConfig();
  const care = careActions(menu);
  return (
    <Sheet visible={visible} title="Customer Care" onClose={onClose}>
      <View style={styles.sheetBody}>
        <Text style={styles.note}>We are happy to help with orders, payments, delivery and products.</Text>
        {care.hours ? <Text style={styles.hours}>{care.hours}</Text> : null}
        {care.call ? (
          <ActionRow icon="phone-outline" label="Call us" value={menu.carePhone} onPress={() => void open(care.call!, 'Could not start the call.')} />
        ) : null}
        {care.whatsapp ? (
          <ActionRow icon="whatsapp" label="WhatsApp" onPress={() => void open(care.whatsapp, 'Could not open WhatsApp.')} />
        ) : null}
        {care.email ? (
          <ActionRow
            icon="email-outline"
            label="Email"
            value={care.email}
            onPress={() => void open(`mailto:${care.email}`, 'Could not open your email app.')}
          />
        ) : null}
        {!hasCare(menu) ? <Text style={styles.note}>Contact details will be added soon.</Text> : null}
      </View>
    </Sheet>
  );
}

/** Store Locator: the store address, hours, helpline and a link to open it in Google Maps. */
export function StoreSheet({ visible, onClose }: MenuSheetProps) {
  const open = useOpenLink();
  const brand = useBrand();
  const menu = useMenuConfig();
  const lines = menuAddressLines(menu.storeAddress);
  const helpline = menuTelHref(menu.storeHelpline);
  return (
    <Sheet visible={visible} title="Store Locator" onClose={onClose}>
      <View style={styles.sheetBody}>
        <View style={styles.storeCard}>
          <View style={[styles.actionIcon, { backgroundColor: brand.primaryBg }]}>
            <MaterialCommunityIcons name="storefront-outline" size={22} color={brand.primary} />
          </View>
          <View style={styles.actionText}>
            <Text style={styles.actionLabel}>{menu.storeName || 'Our store'}</Text>
            {lines.map((line) => (
              <Text key={line} style={styles.actionValue}>
                {line}
              </Text>
            ))}
            {menu.storeHours ? <Text style={styles.hours}>{menu.storeHours}</Text> : null}
          </View>
        </View>
        {menu.storeMapsUrl ? (
          <ActionRow
            icon="map-marker-radius-outline"
            label="Get directions"
            value="Open in Google Maps"
            onPress={() => void open(menu.storeMapsUrl, 'Could not open Maps.')}
          />
        ) : null}
        {helpline ? (
          <ActionRow
            icon="phone-outline"
            label="Call store helpline"
            value={menu.storeHelpline}
            onPress={() => void open(helpline, 'Could not start the call.')}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

/** About: logo, name, website, contact and the installed app version. */
export function AboutSheet({ visible, onClose }: MenuSheetProps) {
  const open = useOpenLink();
  const menu = useMenuConfig();
  return (
    <Sheet visible={visible} title="About Belzo eMart" onClose={onClose}>
      <View style={styles.sheetBody}>
        <View style={styles.aboutHead}>
          <BelzoLogo size={96} />
          <Text style={styles.aboutName}>Belzo eMart</Text>
          <Text style={styles.note}>Shop More. Live Better.</Text>
        </View>
        {menu.website ? (
          <ActionRow
            icon="web"
            label="Website"
            value={menu.website.replace(/^https?:\/\//, '')}
            onPress={() => void open(menu.website, 'Could not open the website.')}
          />
        ) : null}
        {menu.careEmail ? (
          <ActionRow
            icon="email-outline"
            label="Contact"
            value={menu.careEmail}
            onPress={() => void open(`mailto:${menu.careEmail}`, 'Could not open your email app.')}
          />
        ) : null}
        <Text style={styles.version}>App version {APP_VERSION}</Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheetBody: { paddingVertical: theme.spacing.md, gap: theme.spacing.sm },
  note: { ...theme.typography.body, color: theme.colors.muted },
  hours: { ...theme.typography.caption, color: theme.colors.inkStrong, fontWeight: '600' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: 60,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface2,
  },
  pressed: { opacity: 0.75 },
  actionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionText: { flex: 1, gap: 1 },
  actionLabel: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: theme.colors.inkStrong },
  actionValue: { ...theme.typography.caption, color: theme.colors.muted },
  storeCard: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  aboutHead: { alignItems: 'center', gap: theme.spacing.xs, paddingBottom: theme.spacing.sm },
  aboutName: { fontSize: 20, lineHeight: 26, fontWeight: '800', color: theme.colors.inkStrong },
  version: { ...theme.typography.caption, color: theme.colors.mutedSoft, textAlign: 'center', marginTop: theme.spacing.sm },
});
