import { DEFAULT_MOBILE_MENU } from '@belzo/shared';
import { Platform } from 'react-native';

import { careActions, hasCare, hasStore, maskMobile, rateUsUrl, shareMessage } from './menu-config';

describe('maskMobile', () => {
  it('keeps the first two and last four digits', () => {
    expect(maskMobile('9821792101')).toBe('98••••2101');
  });
  it('handles a +91 prefix', () => {
    expect(maskMobile('+919821792101')).toBe('98••••2101');
  });
  it('returns an empty string when there is no number', () => {
    expect(maskMobile(null)).toBe('');
    expect(maskMobile('')).toBe('');
  });
  it('masks a malformed number completely', () => {
    expect(maskMobile('12345')).toBe('••••••');
  });
});

describe('shareMessage', () => {
  it('uses the website when no share link is set', () => {
    expect(shareMessage({ shareUrl: '', website: 'https://belzoemart.com' })).toContain('https://belzoemart.com');
  });
  it('prefers the share link (e.g. the Play Store page)', () => {
    const msg = shareMessage({ shareUrl: 'https://play.google.com/x', website: 'https://belzoemart.com' });
    expect(msg).toContain('https://play.google.com/x');
    expect(msg).not.toContain('belzoemart.com');
  });
  it('includes the referral code only when there is one', () => {
    const menu = { shareUrl: '', website: 'https://belzoemart.com' };
    expect(shareMessage(menu, 'BELZOABC123')).toContain('BELZOABC123');
    expect(shareMessage(menu, null)).not.toContain('referral');
  });
});

describe('menu availability', () => {
  it('defaults offer customer care and a store', () => {
    expect(hasCare(DEFAULT_MOBILE_MENU)).toBe(true);
    expect(hasStore(DEFAULT_MOBILE_MENU)).toBe(true);
    expect(careActions(DEFAULT_MOBILE_MENU).call).toBe('tel:8839095625');
  });
  it('hides customer care when every contact is cleared', () => {
    expect(hasCare({ ...DEFAULT_MOBILE_MENU, carePhone: '', careEmail: '', careWhatsappUrl: '' })).toBe(false);
  });
  it('hides the store when the address is cleared', () => {
    expect(hasStore({ ...DEFAULT_MOBILE_MENU, storeAddress: '' })).toBe(false);
  });
  it('has no Rate Us link until a listing is configured', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(rateUsUrl(DEFAULT_MOBILE_MENU)).toBe('');
    expect(rateUsUrl({ ...DEFAULT_MOBILE_MENU, playStoreUrl: 'https://play.google.com/x' })).toBe('https://play.google.com/x');
    jest.restoreAllMocks();
  });
  it('uses the App Store link on iOS', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(rateUsUrl({ ...DEFAULT_MOBILE_MENU, appStoreUrl: 'https://apps.apple.com/x' })).toBe('https://apps.apple.com/x');
    jest.restoreAllMocks();
  });
});
