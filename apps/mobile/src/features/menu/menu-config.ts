import { Platform } from 'react-native';
import { menuAddressLines, menuTelHref, type MobileMenu } from '@belzo/shared';

import { useMobileHome } from '@/features/home/hooks';

/**
 * Contact, store and link details for the ☰ menu. They come from the admin panel
 * (Admin → Mobile app → App menu) through the public settings, so Belzo can change them without
 * an app update. A value the admin leaves empty hides the matching menu action.
 */
export function useMenuConfig(): MobileMenu {
  return useMobileHome().menu;
}

/** "9821792101" -> "98••••2101". Anything that is not a 10-digit number is masked generically. */
export function maskMobile(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return phone ? '••••••' : '';
  return `${digits.slice(0, 2)}••••${digits.slice(6)}`;
}

/** What the Share action sends. Includes the customer's referral code when they have one. */
export function shareMessage(menu: Pick<MobileMenu, 'shareUrl' | 'website'>, referralCode?: string | null): string {
  const lines = ['Shop groceries and daily essentials on Belzo eMart.'];
  if (referralCode) lines.push(`Use my referral code ${referralCode} when you sign up.`);
  const link = menu.shareUrl || menu.website;
  if (link) lines.push(link);
  return lines.join('\n');
}

/** The store listing for this phone, or '' when the app is not published there yet. */
export function rateUsUrl(menu: Pick<MobileMenu, 'playStoreUrl' | 'appStoreUrl'>): string {
  return Platform.OS === 'ios' ? menu.appStoreUrl : menu.playStoreUrl;
}

/** Which Customer Care actions the admin has configured. */
export function careActions(menu: MobileMenu): { call: string | null; whatsapp: string; email: string; hours: string } {
  return {
    call: menuTelHref(menu.carePhone),
    whatsapp: menu.careWhatsappUrl,
    email: menu.careEmail,
    hours: menu.careHours,
  };
}

/** True when there is at least one way to reach customer care. */
export function hasCare(menu: MobileMenu): boolean {
  const c = careActions(menu);
  return Boolean(c.call || c.whatsapp || c.email);
}

/** True when a store address is configured. */
export function hasStore(menu: MobileMenu): boolean {
  return menuAddressLines(menu.storeAddress).length > 0;
}
