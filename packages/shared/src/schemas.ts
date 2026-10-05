import { z } from 'zod';
import {
  ADMIN_ROLES,
  MAX_PAGE_SIZE,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PRODUCT_STATUSES,
  SUPPORTED_LOCALES,
} from './constants';

/**
 * Zod schemas shared between the API (runtime validation) and the web app
 * (form validation + typed API client). This module is the single source of
 * truth for API request/response contracts.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid();
export const localeSchema = z.enum(SUPPORTED_LOCALES);

/** Indian mobile number: 10 digits, optionally +91 prefixed. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** Password policy: min 8 chars (breached-password check happens server-side). */
export const passwordSchema = z.string().min(8).max(128);

/** Indian PIN code: 6 digits, not starting with 0. */
export const pincodeSchema = z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code');

/** Money on the wire is an integer number of paise. */
export const moneySchema = z.number().int();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** OTP request by phone (primary) or email. At least one must be provided. */
export const otpRequestSchema = z
  .object({ phone: phoneSchema.optional(), email: emailSchema.optional() })
  .refine((d) => Boolean(d.phone) || Boolean(d.email), {
    message: 'Provide a phone number or email',
  });
export type OtpRequest = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  requestId: uuidSchema,
  code: z.string().regex(/^\d{4,6}$/, 'OTP must be 4-6 digits'),
});
export type OtpVerify = z.infer<typeof otpVerifySchema>;

export const emailRegisterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type EmailRegister = z.infer<typeof emailRegisterSchema>;

export const emailLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type EmailLogin = z.infer<typeof emailLoginSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------

export const addressInputSchema = z.object({
  label: z.enum(['home', 'work', 'other']).default('home'),
  fullName: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  pincode: pincodeSchema,
});
export type AddressInput = z.infer<typeof addressInputSchema>;

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const productQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  categoryId: uuidSchema.optional(),
  brandId: uuidSchema.optional(),
  minPrice: z.coerce.number().int().optional(),
  maxPrice: z.coerce.number().int().optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'newest', 'popularity', 'rating', 'discount']).default('relevance'),
  status: z.enum(PRODUCT_STATUSES).optional(),
  /** Comma-separated product ids for an explicit "by ids" fetch (manual rails).
   *  Kept as a raw string so it round-trips through @Query()/URLSearchParams. */
  ids: z.string().trim().optional(),
});
export type ProductQuery = z.infer<typeof productQuerySchema>;

// ---------------------------------------------------------------------------
// Home sections (admin-managed, shared across both storefront themes)
// ---------------------------------------------------------------------------

/** Supported sort proxies for a `sort`-sourced home rail. `popularity`
 *  (ratingCount desc) is the Best-Seller proxy surfaced as "Most popular". */
export const HOME_SECTION_SORTS = ['discount', 'newest', 'popularity', 'rating'] as const;

export const homeSectionSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sort'), sort: z.enum(HOME_SECTION_SORTS) }),
  z.object({ type: z.literal('category'), categoryId: uuidSchema }),
  z.object({ type: z.literal('manual'), productIds: z.array(uuidSchema).min(1).max(50) }),
]);
export type HomeSectionSource = z.infer<typeof homeSectionSourceSchema>;

export const homeSectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(80),
  source: homeSectionSourceSchema,
  limit: z.number().int().min(2).max(24).default(12),
  enabled: z.boolean().default(true),
});
export type HomeSection = z.infer<typeof homeSectionSchema>;

export const homeSectionsSchema = z.array(homeSectionSchema).max(24);
export type HomeSections = z.infer<typeof homeSectionsSchema>;

// ---------------------------------------------------------------------------
// Cart / Checkout
// ---------------------------------------------------------------------------

export const cartItemInputSchema = z.object({
  variantId: uuidSchema,
  quantity: z.number().int().min(1).max(99),
});
export type CartItemInput = z.infer<typeof cartItemInputSchema>;

export const checkoutPreviewSchema = z.object({
  addressId: uuidSchema,
  couponCode: z.string().trim().max(40).optional(),
});
export type CheckoutPreview = z.infer<typeof checkoutPreviewSchema>;

export const placeOrderSchema = z.object({
  addressId: uuidSchema,
  paymentMethod: z.enum(PAYMENT_METHODS),
  couponCode: z.string().trim().max(40).optional(),
});
export type PlaceOrder = z.infer<typeof placeOrderSchema>;

// ---------------------------------------------------------------------------
// Price breakup (checkout preview response + order snapshot)
// ---------------------------------------------------------------------------

export const gstSplitSchema = z.object({
  cgst: moneySchema,
  sgst: moneySchema,
  igst: moneySchema,
});
export type GstSplit = z.infer<typeof gstSplitSchema>;

export const priceBreakupSchema = z.object({
  subtotal: moneySchema,
  discount: moneySchema,
  shipping: moneySchema,
  codFee: moneySchema,
  tax: moneySchema,
  gst: gstSplitSchema,
  grandTotal: moneySchema,
});
export type PriceBreakup = z.infer<typeof priceBreakupSchema>;

// ---------------------------------------------------------------------------
// Orders / Admin
// ---------------------------------------------------------------------------

export const orderStatusSchema = z.enum(ORDER_STATUSES);

export const adminOrderQuerySchema = paginationQuerySchema.extend({
  status: orderStatusSchema.optional(),
  q: z.string().trim().max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type AdminOrderQuery = z.infer<typeof adminOrderQuerySchema>;

export const adminLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  mfaCode: z.string().regex(/^\d{6}$/).optional(),
});
export type AdminLogin = z.infer<typeof adminLoginSchema>;

export const adminRoleSchema = z.enum(ADMIN_ROLES);

// ---------------------------------------------------------------------------
// Standard API error envelope
// ---------------------------------------------------------------------------

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  correlationId: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
