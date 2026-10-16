import { MOBILE_FESTIVALS, type MobileFestival } from '@belzo/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS, zustandStorage } from '@/lib/storage';

export interface FestivalValues {
  festival: MobileFestival;
  /** Custom greeting ('' = the festival's default). */
  greeting: string;
  /** Falling decorations on/off (admin choice). */
  decor: boolean;
}

interface FestivalState extends FestivalValues {
  apply: (v: FestivalValues) => void;
}

function validFestival(v: unknown): MobileFestival {
  return typeof v === 'string' && (MOBILE_FESTIVALS as readonly string[]).includes(v)
    ? (v as MobileFestival)
    : 'none';
}

/**
 * The active festival theme. Persisted so a returning user sees the festive look
 * immediately on launch, before the settings request finishes. Updated by
 * FestivalSync whenever fresh settings arrive.
 */
export const useFestivalStore = create<FestivalState>()(
  persist(
    (set) => ({
      festival: 'none',
      greeting: '',
      decor: true,
      apply: (v) => set({ festival: validFestival(v.festival), greeting: v.greeting, decor: v.decor }),
    }),
    {
      name: STORAGE_KEYS.festival,
      storage: zustandStorage,
      skipHydration: true,
      partialize: (s) => ({ festival: s.festival, greeting: s.greeting, decor: s.decor }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FestivalValues>;
        return {
          ...current,
          festival: validFestival(p.festival),
          greeting: typeof p.greeting === 'string' ? p.greeting : '',
          decor: typeof p.decor === 'boolean' ? p.decor : true,
        };
      },
    },
  ),
);
