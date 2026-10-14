import type { Locale } from '@belzo/shared';

/**
 * Minimal message catalog for API-produced user-facing strings (EN/HI).
 * Larger content (emails, templates) lives in the Notification/CMS units.
 */
type MessageKey = 'welcome' | 'not_found' | 'unauthorized' | 'validation_failed';

const CATALOG: Record<Locale, Record<MessageKey, string>> = {
  en: {
    welcome: 'Welcome to Belzo eMart',
    not_found: 'The requested resource was not found',
    unauthorized: 'You are not authorized to perform this action',
    validation_failed: 'The submitted data is invalid',
  },
  hi: {
    welcome: 'बेल्ज़ो ईमार्ट में आपका स्वागत है',
    not_found: 'अनुरोधित संसाधन नहीं मिला',
    unauthorized: 'आप यह कार्य करने के लिए अधिकृत नहीं हैं',
    validation_failed: 'सबमिट किया गया डेटा अमान्य है',
  },
};

export function translate(key: MessageKey, locale: Locale): string {
  return CATALOG[locale]?.[key] ?? CATALOG.en[key];
}
