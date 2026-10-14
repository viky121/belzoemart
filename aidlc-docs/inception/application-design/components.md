# Components — Belzo eMart (Phase 1)

High-level component identification and responsibilities. Detailed business rules are defined per-unit in
CONSTRUCTION (Functional Design). Backend is a **modular monolith** (NestJS); each component below is a
NestJS module. Frontend is a **single Next.js app** with route groups for shop and admin.

## Architecture Overview

```
+-------------------------------------------------------------+
|                    Web (Next.js app)                        |
|   (shop) storefront routes      /admin  admin routes        |
|   - SSR/ISR pages, PWA          - role-guarded dashboards    |
+---------------------------+---------------------------------+
                            | HTTPS (REST, OpenAPI)
                            v
+-------------------------------------------------------------+
|                   API (NestJS modular monolith)             |
|                                                             |
|  Cross-cutting: Auth guard, RBAC, Validation, RateLimit,    |
|  Logging/Correlation, ErrorHandler, i18n, Security headers  |
|                                                             |
|  Domain modules:                                            |
|   Identity | Catalogue | Cart | Pricing | Checkout |        |
|   Payment | Order | Fulfilment | Returns | Review | Wallet |  |
|   Coupon | Notification | CMS | Media | Search | Reporting |  |
|   AdminSettings/RBAC                                         |
|                                                             |
|  Ports (interfaces) -> Adapters:                            |
|   PaymentProvider->Razorpay/Mock                            |
|   ShippingProvider->ShipRocket/Mock                         |
|   SmsProvider / EmailProvider / WhatsAppProvider / Push     |
+------+----------------+----------------+--------------------+
       |                |                |
       v                v                v
   PostgreSQL        Redis (cache      Object storage
   (RDS)             + BullMQ queue)   (S3) + CDN
                            |
                            v
                     Worker process
             (webhooks, invoices, emails,
              abandoned-cart, shipment sync)
```

## Cross-Cutting Components (platform-core)

### C-1 ConfigModule
- **Purpose**: Load and validate environment config (DB, Redis, provider keys, feature flags).
- **Responsibilities**: Typed config, fail-fast validation at boot, no hardcoded secrets (SECURITY-12).

### C-2 SecurityMiddleware
- **Purpose**: Apply HTTP security headers, CORS allowlist, body-size limits.
- **Responsibilities**: CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy
  (SECURITY-04); restrict CORS origins (SECURITY-08).

### C-3 AuthGuard & RbacGuard
- **Purpose**: Authenticate JWT and authorize by role/permission and resource ownership.
- **Responsibilities**: Verify signature/expiry/issuer/audience; deny-by-default; object-level (IDOR)
  checks (SECURITY-08).

### C-4 ValidationPipe
- **Purpose**: Validate/sanitize all inputs via schema (class-validator / zod).
- **Responsibilities**: Type/length/format checks; reject injection; max payload sizes (SECURITY-05).

### C-5 RateLimiter
- **Purpose**: Throttle public and sensitive endpoints.
- **Responsibilities**: IP/user throttling; stricter limits on auth/OTP/coupon endpoints (SECURITY-11).

### C-6 LoggerModule
- **Purpose**: Structured logging with correlation IDs to centralized store.
- **Responsibilities**: No secrets/PII in logs; request IDs; log levels (SECURITY-03).

### C-7 GlobalErrorHandler
- **Purpose**: Catch unhandled errors; fail closed; generic user messages.
- **Responsibilities**: Map exceptions to safe responses; resource cleanup (SECURITY-15).

### C-8 I18nModule
- **Purpose**: English + Hindi message catalogs and locale resolution.
- **Responsibilities**: Locale from header/user pref; translated API messages and templates (NFR-6.3).

### C-9 QueueModule (BullMQ)
- **Purpose**: Register queues and dispatch async jobs.
- **Responsibilities**: Enqueue with retries/backoff; dead-letter handling (NFR-3.4, RESILIENCY-10).

### C-10 HealthModule
- **Purpose**: Shallow + deep health endpoints.
- **Responsibilities**: Process liveness; DB/Redis/provider connectivity for readiness (RESILIENCY-06).

## Domain Components

### C-11 Identity
- **Purpose**: Authentication and account management for customers and admins.
- **Responsibilities**: OTP/email/social login, JWT issue/refresh rotation, customer profiles, addresses,
  admin users, RBAC roles/permissions, DPDP data-export/deletion (FR-1, FR-13.1, NFR-2.2).
- **Interface**: `IdentityService`, `AddressService`, `AdminUserService`, `RbacService`.

### C-12 Catalogue
- **Purpose**: Categories, products, variants, attributes, brands.
- **Responsibilities**: CRUD, publish states, SEO fields, HSN/tax class linkage, media references
  (FR-2, FR-3, FR-8).
- **Interface**: `CategoryService`, `ProductService`, `VariantService`, `BrandService`,
  `AttributeService`.

### C-12b Inventory
- **Purpose**: Stock levels and movements per variant.
- **Responsibilities**: Reserve/release on order, stock in/out log, reorder level, audit trail
  (FR-8.6). Enforces "stock never negative" invariant (PBT-03).
- **Interface**: `InventoryService`.

### C-13 Cart
- **Purpose**: Persistent shopping cart.
- **Responsibilities**: Add/update/remove items, save-for-later, merge guest→user cart, revalidate
  price/stock (FR-4.1, FR-4.2). Stateful (PBT-06 candidate).
- **Interface**: `CartService`.

### C-14 Pricing
- **Purpose**: Deterministic price/tax computation.
- **Responsibilities**: Line totals, discounts, GST split (CGST/SGST/IGST by place of supply), shipping,
  COD fee, grand total (FR-4.4, NFR-2.1). Pure functions (PBT-01/03 core target).
- **Interface**: `PricingService`, `TaxService`.

### C-15 Coupon
- **Purpose**: Promotion and coupon evaluation.
- **Responsibilities**: Validate codes, usage limits, applicability rules, auto-apply best offer
  (FR-4.3, FR-10.1). Pure evaluation logic (PBT target).
- **Interface**: `CouponService`.

### C-16 Checkout
- **Purpose**: Orchestrate the checkout flow.
- **Responsibilities**: Validate cart/address/stock, compute totals, create pending order, initiate
  payment, coordinate confirmation (FR-4.5–4.9). Idempotent order creation (PBT-04).
- **Interface**: `CheckoutService`.

### C-17 Payment
- **Purpose**: Payment initiation and verification via provider port.
- **Responsibilities**: Create payment order, verify webhook signature, reconcile status, trigger
  refunds (FR-4.6–4.8). Never trust client-side success.
- **Interface**: `PaymentService`, port `PaymentProvider` (adapters: Razorpay, Mock).

### C-18 Order
- **Purpose**: Order lifecycle and state machine.
- **Responsibilities**: Status transitions (Pending→Confirmed→Packed→Shipped→OFD→Delivered), item-wise
  status, cancellation rules, activity log, GST invoice generation (FR-5, FR-9.2, FR-9.3). State machine
  (PBT-06 candidate).
- **Interface**: `OrderService`, `InvoiceService`.

### C-19 Fulfilment
- **Purpose**: Shipping via provider port.
- **Responsibilities**: PIN serviceability, rate/ETA, AWB generation, label/manifest, tracking sync, RTO
  (FR-3.5, FR-5.2, FR-9.5). Async tracking updates via queue.
- **Interface**: `FulfilmentService`, port `ShippingProvider` (adapters: ShipRocket, Mock).

### C-20 Returns
- **Purpose**: Returns/replace/exchange and refunds.
- **Responsibilities**: Return requests with reason/images, pickup scheduling, refund initiation, status
  tracking (FR-5.5, FR-5.6, FR-9.6).
- **Interface**: `ReturnService`, `RefundService`.

### C-21 Review
- **Purpose**: Ratings, reviews, Q&A.
- **Responsibilities**: Verified-purchase badge, photos, helpful votes, moderation queue, report
  (FR-3.8, FR-3.9).
- **Interface**: `ReviewService`, `QnaService`.

### C-22 Wallet
- **Purpose**: Loyalty points / cashback wallet and referrals.
- **Responsibilities**: Ledger entries, earn/redeem, referral codes; balance never negative invariant
  (FR-6.2, PBT-03).
- **Interface**: `WalletService`, `ReferralService`.

### C-23 Notification
- **Purpose**: Multi-channel transactional/marketing messages via ports.
- **Responsibilities**: Template rendering (i18n + variables), send via email/SMS/WhatsApp/push, in-app
  notification centre (FR-4.9, FR-6.3, FR-10.4, FR-13.5).
- **Interface**: `NotificationService`, ports `EmailProvider`/`SmsProvider`/`WhatsAppProvider`/
  `PushProvider` (adapters + Mock).

### C-24 CMS
- **Purpose**: Content — banners, blog, static/legal pages.
- **Responsibilities**: Banner placement/scheduling, CMS pages, legal pages (FR-2.1, FR-10.3, FR-10.7,
  FR-13.6).
- **Interface**: `CmsService`, `BannerService`.

### C-25 Media
- **Purpose**: Image/video upload and delivery.
- **Responsibilities**: Upload to S3, WebP optimisation, CDN URLs, ZIP bulk image import (NFR-3.2,
  FR-8.3). 
- **Interface**: `MediaService`, port `ObjectStorage` (adapter: S3).

### C-26 Search
- **Purpose**: Product search and autocomplete.
- **Responsibilities**: Full-text query, filters, sort, synonyms (Phase 1: PostgreSQL FTS) behind a
  swappable abstraction (FR-2.3, A-3).
- **Interface**: `SearchService` (adapter: PostgresSearch; future: Typesense).

### C-27 Reporting
- **Purpose**: Admin analytics and exports.
- **Responsibilities**: Sales/GST/inventory/returns/customer reports; Excel/CSV/PDF export (FR-12).
- **Interface**: `ReportingService`.

### C-28 AdminSettings
- **Purpose**: Store, shipping, payment, and template settings + audit log.
- **Responsibilities**: Config CRUD, serviceable PINs, COD rules, admin activity audit (FR-13).
- **Interface**: `SettingsService`, `AuditLogService`.

## Frontend Components (apps/web)

### C-29 Storefront UI
- **Purpose**: Customer-facing pages under `(shop)` route group.
- **Responsibilities**: Home, category/listing, product detail, cart, checkout, account, orders, PWA
  shell, i18n, analytics tags (FR-1..FR-6, NFR-6).

### C-30 Admin UI
- **Purpose**: Back-office pages under `/admin`, role-guarded.
- **Responsibilities**: Dashboard, catalogue/inventory, orders/fulfilment, marketing/CMS, customers,
  reports, settings (FR-7..FR-13).

### C-31 Shared Package (packages/shared)
- **Purpose**: Shared TypeScript types, DTOs, zod validation schemas, constants, formatting utils.
- **Responsibilities**: Single source of truth for API contracts across web and api; PBT round-trip
  target for DTO (de)serialization (PBT-02).
