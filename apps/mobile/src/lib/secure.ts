import * as SecureStore from 'expo-secure-store';

/** SecureStore keys (design §6.3). Values never reach AsyncStorage, Zustand or logs. */
export const SECURE_KEYS = {
  refreshToken: 'belzo.refreshToken',
  guestToken: 'belzo.guestToken',
  pendingMerge: 'belzo.pendingMerge',
} as const;

export const secure = {
  getRefreshToken: () => SecureStore.getItemAsync(SECURE_KEYS.refreshToken),
  setRefreshToken: (token: string) => SecureStore.setItemAsync(SECURE_KEYS.refreshToken, token),
  deleteRefreshToken: () => SecureStore.deleteItemAsync(SECURE_KEYS.refreshToken),

  /** Reads the guest token without creating one (used by the post-login merge). */
  peekGuestToken: () => SecureStore.getItemAsync(SECURE_KEYS.guestToken),
  setGuestToken: (token: string) => SecureStore.setItemAsync(SECURE_KEYS.guestToken, token),

  getPendingMergeToken: () => SecureStore.getItemAsync(SECURE_KEYS.pendingMerge),
  setPendingMerge: (guestToken: string) =>
    SecureStore.setItemAsync(SECURE_KEYS.pendingMerge, guestToken),
  deletePendingMerge: () => SecureStore.deleteItemAsync(SECURE_KEYS.pendingMerge),
};
