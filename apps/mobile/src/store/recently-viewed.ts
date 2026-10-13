import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS, zustandStorage } from '@/lib/storage';

export const RECENTLY_VIEWED_MAX = 20;

interface RecentlyViewedState {
  ids: string[];
  push: (productId: string) => void;
  clear: () => void;
}

/** Product ids, newest first, max 20 (persisted `belzo.recentlyViewed`). */
export const useRecentlyViewedStore = create<RecentlyViewedState>()(
  persist(
    (set) => ({
      ids: [],
      push: (productId) =>
        set((s) => ({
          ids: [productId, ...s.ids.filter((id) => id !== productId)].slice(0, RECENTLY_VIEWED_MAX),
        })),
      clear: () => set({ ids: [] }),
    }),
    {
      name: STORAGE_KEYS.recentlyViewed,
      storage: zustandStorage,
      skipHydration: true,
      partialize: (s) => ({ ids: s.ids }),
      merge: (persisted, current) => {
        const ids = (persisted as { ids?: unknown } | undefined)?.ids;
        return {
          ...current,
          ids: Array.isArray(ids)
            ? ids.filter((x): x is string => typeof x === 'string').slice(0, RECENTLY_VIEWED_MAX)
            : [],
        };
      },
    },
  ),
);
