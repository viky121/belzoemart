import { create } from 'zustand';

interface CheckoutDraftState {
  couponCode: string | null;
  setCouponCode: (code: string | null) => void;
  clear: () => void;
}

/** Coupon carried from Cart to Checkout (memory only; the web uses sessionStorage). */
export const useCheckoutDraft = create<CheckoutDraftState>()((set) => ({
  couponCode: null,
  setCouponCode: (couponCode) => set({ couponCode }),
  clear: () => set({ couponCode: null }),
}));
