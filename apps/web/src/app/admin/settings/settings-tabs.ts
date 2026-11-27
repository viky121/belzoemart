/** The groups the Settings page is split into. Pure data + helpers, so the page stays readable and testable. */

export type SettingsTabKey = 'store' | 'orders' | 'storefront' | 'notifications' | 'tracking';

export interface SettingsTab {
  key: SettingsTabKey;
  label: string;
  icon: string;
  /** One line under the tabs: what lives here. */
  blurb: string;
}

export const SETTINGS_TABS: readonly SettingsTab[] = [
  { key: 'store', label: 'Store & invoice', icon: '🏪', blurb: 'Your business details. They are printed on every GST tax invoice.' },
  { key: 'orders', label: 'Orders & delivery', icon: '🚚', blurb: 'Self pickup, shipping charges and Cash on Delivery.' },
  { key: 'storefront', label: 'Storefront', icon: '🛍', blurb: 'How the customer website looks: theme, home page, home sections and footer.' },
  { key: 'notifications', label: 'Notifications', icon: '🔔', blurb: 'Emails to you when orders come in, and the SMS that sends login codes (OTP) to customers.' },
  { key: 'tracking', label: 'Ads & tracking', icon: '📈', blurb: 'Google Analytics and Facebook Pixel for your ads, on the website and in the app.' },
];

export const DEFAULT_SETTINGS_TAB: SettingsTabKey = 'store';

/** The tab named by a URL hash like "#orders"; the default when it is missing or unknown. */
export function tabFromHash(hash: string | null | undefined): SettingsTabKey {
  const key = (hash ?? '').replace(/^#/, '').trim().toLowerCase();
  return SETTINGS_TABS.find((t) => t.key === key)?.key ?? DEFAULT_SETTINGS_TAB;
}

/** A short, plain name for a saved setting, for the "Saved" message (never the raw key). */
export function settingLabel(key: string): string {
  if (key === 'theme') return 'Storefront theme';
  if (key === 'tracking') return 'Tracking IDs';
  if (key === 'notifications.admin') return 'Order alert settings';
  if (key.startsWith('store.')) return 'Store & invoice details';
  if (key.startsWith('pickup.')) return 'Self pickup settings';
  if (key.startsWith('shipping.')) return 'Shipping settings';
  if (key.startsWith('payment.')) return 'Payment settings';
  return 'Settings';
}
