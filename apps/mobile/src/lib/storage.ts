import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

import { logger } from './logger';

/** AsyncStorage JSON helpers. Never used for tokens (those live in SecureStore, see secure.ts). */
export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw == null ? null : (JSON.parse(raw) as T);
  } catch (e) {
    logger.warn('storage.readJson failed', key, e);
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function readString(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch (e) {
    logger.warn('storage.readString failed', key, e);
    return null;
  }
}

export async function writeString(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function removeKey(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

/** Storage adapter for Zustand `persist`. */
export const zustandStorage = createJSONStorage(() => AsyncStorage);

export const STORAGE_KEYS = {
  pincode: 'belzo.pincode',
  recentlyViewed: 'belzo.recentlyViewed',
  recentSearches: 'belzo.recentSearches',
  onboarding: 'belzo.onboarding.v1',
  checkoutAttempt: 'belzo.checkout.attempt',
  festival: 'belzo.festival',
} as const;
