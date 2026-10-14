import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@/lib/storage';

import { computeFingerprint, getOrCreateAttempt, settleAttempt } from '../checkout-attempt';

const base = { addressId: 'a1', paymentMethod: 'cod', couponCode: null as string | null };

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('computeFingerprint', () => {
  it('is independent of line order', async () => {
    const a = await computeFingerprint({ ...base, lines: [{ variantId: 'v1', quantity: 1 }, { variantId: 'v2', quantity: 2 }] });
    const b = await computeFingerprint({ ...base, lines: [{ variantId: 'v2', quantity: 2 }, { variantId: 'v1', quantity: 1 }] });
    expect(a).toBe(b);
  });
  it('changes when a quantity changes', async () => {
    const a = await computeFingerprint({ ...base, lines: [{ variantId: 'v1', quantity: 1 }] });
    const b = await computeFingerprint({ ...base, lines: [{ variantId: 'v1', quantity: 2 }] });
    expect(a).not.toBe(b);
  });
});

describe('getOrCreateAttempt', () => {
  it('reuses the key for the same fingerprint within the TTL', async () => {
    const fp = await computeFingerprint({ ...base, lines: [{ variantId: 'v1', quantity: 1 }] });
    const k1 = await getOrCreateAttempt(fp);
    const k2 = await getOrCreateAttempt(fp);
    expect(k2).toBe(k1);
  });

  it('mints a new key when the fingerprint changes', async () => {
    const fp1 = await computeFingerprint({ ...base, lines: [{ variantId: 'v1', quantity: 1 }] });
    const fp2 = await computeFingerprint({ ...base, lines: [{ variantId: 'v1', quantity: 2 }] });
    const k1 = await getOrCreateAttempt(fp1);
    const k2 = await getOrCreateAttempt(fp2);
    expect(k2).not.toBe(k1);
  });

  it('mints a new key after 30 minutes', async () => {
    const fp = await computeFingerprint({ ...base, lines: [] });
    const now = 1_700_000_000_000;
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const k1 = await getOrCreateAttempt(fp);
    spy.mockReturnValue(now + 31 * 60_000);
    const k2 = await getOrCreateAttempt(fp);
    expect(k2).not.toBe(k1);
  });

  it('persists the key so it survives an app restart', async () => {
    const fp = await computeFingerprint({ ...base, lines: [] });
    const k1 = await getOrCreateAttempt(fp);
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.checkoutAttempt);
    expect(JSON.parse(raw as string).key).toBe(k1);
  });

  it('settleAttempt definitive clears the key; ambiguous keeps it', async () => {
    const fp = await computeFingerprint({ ...base, lines: [] });
    const k1 = await getOrCreateAttempt(fp);
    await settleAttempt('ambiguous');
    expect(await getOrCreateAttempt(fp)).toBe(k1);
    await settleAttempt('definitive');
    expect(await getOrCreateAttempt(fp)).not.toBe(k1);
  });
});
