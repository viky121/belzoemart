import { pincodeSchema } from '@belzo/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS, zustandStorage } from '@/lib/storage';

interface PincodeState {
  pincode: string | null;
  setPincode: (pincode: string | null) => void;
}

/** Delivery PIN (persisted `belzo.pincode`, validated with `pincodeSchema` on hydrate). */
export const usePincodeStore = create<PincodeState>()(
  persist(
    (set) => ({
      pincode: null,
      setPincode: (pincode) =>
        set({
          pincode: pincode !== null && pincodeSchema.safeParse(pincode).success ? pincode : null,
        }),
    }),
    {
      name: STORAGE_KEYS.pincode,
      storage: zustandStorage,
      skipHydration: true,
      partialize: (s) => ({ pincode: s.pincode }),
      merge: (persisted, current) => {
        const p = (persisted as { pincode?: unknown } | undefined)?.pincode;
        return {
          ...current,
          pincode: typeof p === 'string' && pincodeSchema.safeParse(p).success ? p : null,
        };
      },
    },
  ),
);
