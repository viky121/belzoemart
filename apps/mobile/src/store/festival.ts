import { MOBILE_FESTIVALS, isValidDateKey, istDateKey, type MobileFestival } from '@belzo/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS, zustandStorage } from '@/lib/storage';

export interface FestivalValues {
  festival: MobileFestival;
  /** Custom greeting ('' = the festival's default). */
  greeting: string;
  /** Falling decorations on/off (admin choice). */
  decor: boolean;
  /** First day the theme shows (India date `YYYY-MM-DD`, '' = no limit). */
  start: string;
  /** Last day the theme shows (India date `YYYY-MM-DD`, '' = no limit). */
  end: string;
}

interface FestivalState extends FestivalValues {
  /** Today's India date. Not persisted; bumped so the theme re-checks its schedule. */
  day: string;
  apply: (v: FestivalValues) => void;
  tick: () => void;
}

function validFestival(v: unknown): MobileFestival {
  return typeof v === 'string' && (MOBILE_FESTIVALS as readonly string[]).includes(v)
    ? (v as MobileFestival)
    : 'none';
}

const validDate = (v: unknown): string => (isValidDateKey(v) ? v : '');

/**
 * The festival theme the admin chose, with its schedule. Persisted so a returning user
 * sees the festive look immediately on launch, before the settings request finishes
 * (and it still ends on time while offline, because the dates are stored too).
 * Updated by FestivalSync whenever fresh settings arrive.
 */
export const useFestivalStore = create<FestivalState>()(
  persist(
    (set) => ({
      festival: 'none',
      greeting: '',
      decor: true,
      start: '',
      end: '',
      day: istDateKey(),
      apply: (v) =>
        set({
          festival: validFestival(v.festival),
          greeting: v.greeting,
          decor: v.decor,
          start: validDate(v.start),
          end: validDate(v.end),
        }),
      tick: () => set({ day: istDateKey() }),
    }),
    {
      name: STORAGE_KEYS.festival,
      storage: zustandStorage,
      skipHydration: true,
      partialize: (s) => ({
        festival: s.festival,
        greeting: s.greeting,
        decor: s.decor,
        start: s.start,
        end: s.end,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FestivalValues>;
        return {
          ...current,
          festival: validFestival(p.festival),
          greeting: typeof p.greeting === 'string' ? p.greeting : '',
          decor: typeof p.decor === 'boolean' ? p.decor : true,
          // Values saved by an older app version have no dates: treat as "no limit".
          start: validDate(p.start),
          end: validDate(p.end),
        };
      },
    },
  ),
);
