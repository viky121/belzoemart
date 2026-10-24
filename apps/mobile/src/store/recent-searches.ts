import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS, zustandStorage } from '@/lib/storage';

export const RECENT_SEARCHES_MAX = 10;

interface RecentSearchesState {
  terms: string[];
  add: (term: string) => void;
  clear: () => void;
}

/** Recent search strings, max 10, de-duplicated case-insensitively (persisted). */
export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set) => ({
      terms: [],
      add: (term) => {
        const t = term.trim();
        if (!t) return;
        set((s) => ({
          terms: [t, ...s.terms.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(
            0,
            RECENT_SEARCHES_MAX,
          ),
        }));
      },
      clear: () => set({ terms: [] }),
    }),
    {
      name: STORAGE_KEYS.recentSearches,
      storage: zustandStorage,
      skipHydration: true,
      partialize: (s) => ({ terms: s.terms }),
      merge: (persisted, current) => {
        const terms = (persisted as { terms?: unknown } | undefined)?.terms;
        return {
          ...current,
          terms: Array.isArray(terms)
            ? terms.filter((x): x is string => typeof x === 'string').slice(0, RECENT_SEARCHES_MAX)
            : [],
        };
      },
    },
  ),
);
