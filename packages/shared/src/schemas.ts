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
  .object({
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    /** Optional: "register" refuses numbers already registered, "reset" only works for existing accounts. */
    purpose: z.enum(['login', 'register', 'reset']).optional(),
  })
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

// ---------------------------------------------------------------------------
// Verified sign-up, mobile + password sign-in, password reset
// ---------------------------------------------------------------------------

/** What a new customer password must contain. Shared so the web, the app and the API show and enforce the same rules. */
export const PASSWORD_RULES: { key: 'length' | 'upper' | 'lower' | 'symbol'; label: string; test: (p: string) => boolean }[] = [
  { key: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { key: 'upper', label: 'One capital letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'One small letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { key: 'symbol', label: 'One symbol (for example @ # $ % !)', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

/** Labels of the rules `password` does not meet yet (empty = strong enough). */
export function passwordProblems(password: string): string[] {
  return PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.label);
}

/** A new password: 8+ characters with a capital letter, a small letter and a symbol. */
export const strongPasswordSchema = z
  .string()
  .max(128, 'Password is too long')
  .superRefine((p, ctx) => {
    const problems = passwordProblems(p);
    if (problems.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Password needs: ${problems.join(', ').toLowerCase()}` });
    }
  });

/** Why an OTP is being requested; sign-up and reset check whether the number/email is already registered. */
export const otpPurposeSchema = z.enum(['login', 'register', 'reset']);
export type OtpPurpose = z.infer<typeof otpPurposeSchema>;

/** A blank form field means "not given". */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/**
 * Create an account. Name + mobile (verified by OTP), the password twice. The email is optional: when it is
 * given it must be verified by OTP too (`emailProof`), so no one can attach someone else's address.
 */
export const registerAccountSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name').max(120),
    email: z.preprocess(blankToUndefined, emailSchema.optional()),
    phone: phoneSchema,
    password: strongPasswordSchema,
    confirmPassword: z.string().max(128),
    phoneProof: z.string().min(20).max(2000),
    emailProof: z.preprocess(blankToUndefined, z.string().min(20).max(2000).optional()),
  })
  .superRefine((d, ctx) => {
    if (d.password !== d.confirmPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'Both passwords must match' });
    }
    if (d.email && !d.emailProof) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emailProof'],
        message: 'Verify your email with the OTP, or leave the email empty',
      });
    }
  });
export type RegisterAccount = z.infer<typeof registerAccountSchema>;

/** Sign in with the mobile number and password. */
export const phoneLoginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type PhoneLogin = z.infer<typeof phoneLoginSchema>;

/** Sign in with EITHER the mobile number or the email, plus the password. */
export const identifierLoginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, 'Enter your mobile number or email')
    .max(254)
    .refine(
      (v) => emailSchema.safeParse(v).success || phoneSchema.safeParse(v.replace(/[\s-]/g, '')).success,
      'Enter a valid mobile number or email',
    ),
  password: z.string().min(1, 'Enter your password').max(128),
});
export type IdentifierLogin = z.infer<typeof identifierLoginSchema>;

/** Set a new password after proving the mobile number (or email) by OTP. */
export const passwordResetSchema = z
  .object({
    proof: z.string().min(20).max(2000),
    password: strongPasswordSchema,
    confirmPassword: z.string().max(128),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Both passwords must match',
  });
export type PasswordReset = z.infer<typeof passwordResetSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

/** Native-client (X-Client-Platform: mobile) refresh/logout bodies and auth responses. */
export const mobileRefreshSchema = z.object({ refreshToken: z.string().min(1).max(512) });
export const mobileLogoutSchema = mobileRefreshSchema.partial();
export const customerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  locale: z.string(),
});
export const mobileAuthResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string().min(1),
  customer: customerSummarySchema,
});
export const mobileRefreshResponseSchema = mobileAuthResponseSchema.omit({ customer: true });
export type MobileAuthResponse = z.infer<typeof mobileAuthResponseSchema>;
export type CustomerSummary = z.infer<typeof customerSummarySchema>;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const profilePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  // Customers created via mobile OTP have no email (and vice-versa); the
  // profile-completion flow lets them add the missing contact. Uniqueness is
  // enforced server-side in ProfileService.update.
  email: z.string().trim().email('Enter a valid email address').max(190).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+?91)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
    .optional(),
  gender: z.string().trim().max(20).optional(),
  dob: z.string().datetime().optional(),
  photoUrl: z.string().url().optional(),
  locale: z.enum(['en', 'hi']).optional(),
});

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
// Home content (admin-managed, theme-scoped: hero + promos + why + blocks)
// ---------------------------------------------------------------------------

/** App path ("/x", not "//") or absolute http(s) URL → anything else becomes "#".
 *  Never throws, so a bad link degrades one field instead of dropping the block. */
export const safeHrefSchema = z
  .string()
  .trim()
  .max(2048)
  .transform((s) => (/^https?:\/\//i.test(s) || (s.startsWith('/') && !s.startsWith('//')) ? s : '#'))
  .catch('#');

export const PROMO_COLORS = ['green', 'blue', 'amber', 'pink'] as const;

export const heroContentSchema = z.object({
  eyebrow: z.string().trim().max(120).default(''),
  line1: z.string().trim().max(120).default(''),
  line2: z.string().trim().max(120).default(''),
  accent: z.string().trim().max(120).default(''),
  subtitle: z.string().trim().max(400).default(''),
  ctaText: z.string().trim().max(60).default('Shop Now'),
  ctaHref: safeHrefSchema.default('/search'),
  imageUrl: safeHrefSchema.default(''),
});
export type HeroContent = z.infer<typeof heroContentSchema>;

export const promoContentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(160).default(''),
  cta: z.string().trim().max(60).default('Shop Now'),
  href: safeHrefSchema.default('/search'),
  /** Not shown any more (tiles carry no icon); kept so saved content stays valid. */
  icon: z.string().trim().max(8).default(''),
  color: z.enum(PROMO_COLORS).default('green'),
  /**
   * A picture that fills the whole tile (the website and app then show just the picture, with the
   * title as its description). '' = a coloured text tile.
   */
  imageUrl: safeHrefSchema.default(''),
});
export type PromoContent = z.infer<typeof promoContentSchema>;

export const whyItemSchema = z.object({
  /** Not shown any more (no icons); kept so saved content stays valid. */
  icon: z.string().trim().max(8).default(''),
  title: z.string().trim().min(1).max(80),
  sub: z.string().trim().max(120).default(''),
  /** A picture that fills the whole card; the title is then only its description. '' = a text card. */
  imageUrl: safeHrefSchema.default(''),
});
export type WhyItem = z.infer<typeof whyItemSchema>;

/** Repeatable info card inside a 'cards' block. */
export const homeBlockCardSchema = z.object({
  /** Not shown any more (no icons); kept so saved content stays valid. */
  icon: z.string().trim().max(8).default(''),
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(160).default(''),
  href: safeHrefSchema.default('#'),
  /** A picture that fills the whole card; the title is then only its description. '' = a text card. */
  imageUrl: safeHrefSchema.default(''),
});
export type HomeBlockCard = z.infer<typeof homeBlockCardSchema>;

/** Generic admin-added detail block. Discriminated on `type`.
 *  'banner' = titled text + optional image + optional CTA.
 *  'cards'  = titled grid of up to 12 info cards. */
export const homeBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('banner'),
    id: z.string().min(1).max(64),
    title: z.string().trim().max(120).default(''),
    text: z.string().trim().max(600).default(''),
    imageUrl: safeHrefSchema.default(''),
    ctaText: z.string().trim().max(60).default(''),
    ctaHref: safeHrefSchema.default('#'),
    enabled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('cards'),
    id: z.string().min(1).max(64),
    title: z.string().trim().max(120).default(''),
    cards: z.array(homeBlockCardSchema).max(12).default([]),
    enabled: z.boolean().default(true),
  }),
]);
export type HomeBlock = z.infer<typeof homeBlockSchema>;

export const homeContentSchema = z.object({
  hero: heroContentSchema.default(heroContentSchema.parse({})),
  promos: z.array(promoContentSchema).max(12).default([]),
  why: z.array(whyItemSchema).max(12).default([]),
  blocks: z.array(homeBlockSchema).max(10).default([]),
});
export type HomeContent = z.infer<typeof homeContentSchema>;

/** Map a (possibly bad) array to only its valid elements, with zod defaults
 *  applied. Non-arrays yield an empty list. */
function keepValid<S extends z.ZodTypeAny>(value: unknown, schema: S): z.output<S>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => schema.safeParse(v))
    .filter((r): r is { success: true; data: z.output<S> } => r.success)
    .map((r) => r.data);
}

/** Per-key hero schemas so each present field is validated in isolation
 *  (a single bad field degrades to its default, not the whole hero). */
const heroFieldSchemas = heroContentSchema.shape;

/** Sanitize one block. For a 'cards' block the nested cards are cleaned
 *  per-card first (a single malformed card is dropped, the block is kept)
 *  rather than failing the whole block. Returns null for an unusable block. */
function sanitizeBlock(value: unknown): HomeBlock | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.type === 'cards') {
    const cards = keepValid(v.cards, homeBlockCardSchema).slice(0, 12);
    const r = homeBlockSchema.safeParse({ ...v, cards });
    return r.success ? r.data : null;
  }
  const r = homeBlockSchema.safeParse(v);
  return r.success ? r.data : null;
}

function sanitizeHero(value: unknown): Partial<HeroContent> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const out: Partial<HeroContent> = {};
  for (const key of Object.keys(heroFieldSchemas) as (keyof HeroContent)[]) {
    if (!(key in v)) continue; // absent → let default apply at merge time
    const r = heroFieldSchemas[key].safeParse(v[key]);
    if (r.success) out[key] = r.data as never; // keep only valid present fields
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Sanitize stored home content leniently and per-element so the web can merge
 * the result over its theme defaults. Returns null when there is nothing to
 * merge (unset key / not an object). Bad array entries are dropped, bad hrefs
 * degrade to "#", and caps are enforced.
 */
export function sanitizeHomeContent(value: unknown): Partial<HomeContent> | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const out: Partial<HomeContent> = {};
  const hero = sanitizeHero(v.hero);
  // Partial hero by design — the web merges it over the per-theme hero default.
  if (hero) out.hero = hero as HeroContent;
  out.promos = keepValid(v.promos, promoContentSchema).slice(0, 12);
  out.why = keepValid(v.why, whyItemSchema).slice(0, 12);
  out.blocks = (Array.isArray(v.blocks) ? v.blocks : [])
    .map(sanitizeBlock)
    .filter((b): b is HomeBlock => b !== null)
    .slice(0, 10);
  return out;
}

// ---------------------------------------------------------------------------
// Cart / Checkout
// ---------------------------------------------------------------------------

/** Most units of one product a single cart line can hold. */
export const MAX_CART_QTY = 99;
export const cartItemInputSchema = z.object({
  variantId: uuidSchema,
  quantity: z.number().int().min(1).max(MAX_CART_QTY),
});
export type CartItemInput = z.infer<typeof cartItemInputSchema>;

export const checkoutPreviewSchema = z.object({
  addressId: uuidSchema,
  couponCode: z.string().trim().max(40).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
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
