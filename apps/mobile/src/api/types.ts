/**
 * Response DTOs not already in @belzo/shared (design §4.3). Typed casts of trusted first-party
 * JSON; runtime parsing is applied only to auth/refresh responses and the error envelope.
 */
import type {
  AddressInput,
  HomeContent,
  PaymentMethod,
  PriceBreakup,
  ProductCardDto,
  ProductSort,
} from '@belzo/shared';

export interface CartLine {
  id: string;
  variantId: string;
  productId: string;
  quantity: number;
  savedForLater: boolean;
  title: string;
  sku: string;
  unit: string | null;
  imageUrl: string | null;
  unitPrice: number;
  basePrice: number;
  mrp: number;
  discountPct: number;
  taxRatePct: number;
  inStock: boolean;
  available: number;
  /** Bulk pricing tiers for this variant (minQty ascending). */
  priceSlabs: { minQty: number; unitPrice: number }[];
  /** Total units of this product across the cart (drives the tier). */
  tierQty: number;
  /** True when the variant/product is no longer sold. */
  unavailable?: boolean;
}

export interface CartView {
  cartId: string;
  items: CartLine[];
}

export interface WishlistItem {
  id: string;
  variantId: string;
  createdAt: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  unit: string | null;
  mrp: number;
  sellingPrice: number;
  discountPct: number;
  inStock: boolean;
}

export interface Address extends AddressInput {
  id: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Banner {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  title: string | null;
  displayOrder: number;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isActive: boolean;
}

export interface PublicSettings {
  theme: string;
  home: Partial<HomeContent> | null;
  footer: unknown;
  sections: unknown;
}

export interface OrderListItem {
  id: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  itemCount: number;
  imageUrl: string | null;
  items: { title: string; quantity: number; imageUrl?: string | null }[];
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface CmsPageSummary {
  slug: string;
  title: string;
}

export interface CmsPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  isActive: boolean;
  updatedAt: string;
}

export interface DataRequest {
  id: string;
  type: 'export' | 'deletion';
  status: 'pending' | 'processing' | 'completed';
  resultUrl: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  imagesJson: unknown;
  verifiedPurchase: boolean;
  createdAt: string;
}

export interface OtpRequestResult {
  requestId: string;
  expiresAt: string;
  devCode?: string;
}

export interface CheckoutPreviewResult {
  breakup: PriceBreakup;
  coupon: { code: string; valid: boolean; reason?: string; discount: number } | null;
  items: unknown[];
  serviceable: boolean;
  codEnabled: boolean;
  shippingWaived: boolean;
}

export interface PlaceOrderResult {
  orderId: string;
  reused: boolean;
  breakup: PriceBreakup;
  payment: { provider: string; amount: number; clientConfig?: Record<string, unknown> };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  dob: string | null;
  photoUrl: string | null;
  locale: string;
  status: string;
}

/** Query params of GET /products (used by qk.products). */
export interface ProductParams {
  page?: number;
  pageSize?: number;
  sort?: ProductSort;
  categoryId?: string;
  brandId?: string;
  ids?: string;
}

export interface SearchParams {
  q: string;
  page?: number;
  pageSize?: number;
  sort?: ProductSort;
}

export type { PaymentMethod, ProductCardDto };
