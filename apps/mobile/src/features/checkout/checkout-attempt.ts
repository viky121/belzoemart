import * as Crypto from 'expo-crypto';

import { readJson, removeKey, writeJson, STORAGE_KEYS } from '@/lib/storage';

const TTL_MS = 30 * 60_000;

export interface AttemptLine {
  variantId: string;
  quantity: number;
}

interface StoredAttempt {
  key: string;
  fingerprint: string;
  createdAt: number;
}

/** Deterministic fingerprint of the checkout inputs (design §6.6). */
export async function computeFingerprint(input: {
  addressId: string;
  paymentMethod: string;
  couponCode?: string | null;
  lines: AttemptLine[];
}): Promise<string> {
  const parts = [
    input.addressId,
    input.paymentMethod,
    input.couponCode ?? '',
    ...input.lines.map((l) => `${l.variantId}:${l.quantity}`).sort(),
  ].join('|');
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, parts);
}

/**
 * Returns a stable idempotency key for a checkout: reuses the stored key when the fingerprint
 * matches and it is under 30 min old, otherwise mints a new one (design §6.6).
 */
export async function getOrCreateAttempt(fingerprint: string): Promise<string> {
  const stored = await readJson<StoredAttempt>(STORAGE_KEYS.checkoutAttempt);
  if (stored && stored.fingerprint === fingerprint && Date.now() - stored.createdAt < TTL_MS) {
    return stored.key;
  }
  const key = Crypto.randomUUID();
  await writeJson(STORAGE_KEYS.checkoutAttempt, { key, fingerprint, createdAt: Date.now() });
  return key;
}

/** Clear the stored key for a definitive outcome; keep it for an ambiguous one (design §6.6). */
export async function settleAttempt(outcome: 'definitive' | 'ambiguous'): Promise<void> {
  if (outcome === 'definitive') await removeKey(STORAGE_KEYS.checkoutAttempt);
}
