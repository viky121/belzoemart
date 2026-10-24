import * as Crypto from 'expo-crypto';

import { secure } from '@/lib/secure';

/**
 * Guest-cart token (design §5.6): a UUID in SecureStore `belzo.guestToken`, memoised after the
 * first read. Always >= 8 chars, which satisfies the server's resolveCartRef check.
 */
let memo: Promise<string> | null = null;

async function loadOrCreate(): Promise<string> {
  const existing = await secure.peekGuestToken();
  if (existing && existing.length >= 8) return existing;
  const token = Crypto.randomUUID();
  await secure.setGuestToken(token);
  return token;
}

export function getGuestToken(): Promise<string> {
  if (!memo) {
    memo = loadOrCreate().catch((e: unknown) => {
      memo = null;
      throw e;
    });
  }
  return memo;
}

/** Replaces the guest token with a new UUID (after a successful cart merge). */
export async function rotateGuestToken(): Promise<string> {
  const token = Crypto.randomUUID();
  await secure.setGuestToken(token);
  memo = Promise.resolve(token);
  return token;
}

/** Test-only: forget the memoised value. */
export function __resetGuestTokenForTests(): void {
  memo = null;
}
