# Units of Work — Belzo eMart (Phase 1)

Decomposition of the platform into 7 buildable units (logical modules within the modular monolith), built
in strict dependency order. Each unit is a demoable end-to-end slice (backend + relevant storefront/admin
UI + tests + PBT + OpenAPI + seed data).

## Definition of Done (per unit)
A unit is complete when all of the following hold:
- Backend code (NestJS modules/services/controllers) implemented.
- Relevant frontend pages (Next.js) implemented for that slice.
- Unit + integration tests passing; applicable property-based tests (fast-check) passing.
- Project build passing (typecheck + lint).
- OpenAPI spec updated for new endpoints.
- Idempotent seed data added where relevant.
- Brief unit summary doc under `aidlc-docs/construction/{unit}/code/`.
- Applicable Security, Resiliency, and PBT extension rules verified (no blocking findings).

## Code Organization (Greenfield)
Monorepo layout at workspace root `c:\xampp\htdocs\Belzo`:
```
Belzo/
  apps/
    web/                 # Next.js (storefront + /admin route group), PWA, i18n (en/hi)
    api/                 # NestJS modular monolith + worker entrypoint
  packages/
    shared/              # TS types, zod schemas, money utils, constants (source of truth)
  infra/                 # IaC (AWS), docker-compose for local dev
  aidlc-docs/            # documentation (this)
```
Backend module layout inside `apps/api/src`:
```
src/
  main.ts                # HTTP bootstrap
  worker.ts              # BullMQ worker bootstrap
  common/                # platform-core: guards, pipes, filters, interceptors, config, i18n, health
  modules/
    identity/ catalogue/ inventory/ cart/ pricing/ coupon/ checkout/ payment/
    order/ fulfilment/ returns/ review/ wallet/ notification/ cms/ media/ search/
    reporting/ settings/
  integrations/          # ports + adapters (razorpay, shiprocket, sms, whatsapp, email, storage) + mocks
```

## Units

### U1 — platform-core
- **Responsibility**: Foundational scaffolding shared by all units.
- **Includes (components)**: Config, SecurityMiddleware, Auth/RBAC guards (skeleton), ValidationPipe,
  RateLimiter, Logger, GlobalErrorHandler, I18n, QueueModule, HealthModule; monorepo + `packages/shared`;
  Prisma/TypeORM + PostgreSQL connection; Redis + BullMQ; docker-compose for local dev; GitHub Actions
  CI skeleton (build/test/lint/dependency-scan); OpenAPI setup; base Next.js app shell + PWA + i18n.
- **Demo**: App boots; `/health` shallow+deep; sample localized endpoint; CI runs green.
- **Depends on**: none.

### U2 — identity
- **Responsibility**: Authentication & accounts for customers and admins.
- **Includes**: Identity, Address, AdminUser, Rbac; OTP (via SMS port/mock), email+password (argon2),
  Google social login, JWT access + refresh rotation (httpOnly cookie), sessions, brute-force lockout,
  admin MFA, DPDP export/deletion jobs; storefront auth pages (login/signup/profile/addresses); admin
  login.
- **Demo**: Customer OTP + email login; profile & addresses; admin login with MFA; token refresh.
- **Depends on**: U1.

### U3 — catalogue
- **Responsibility**: Product catalogue, inventory, media, search.
- **Includes**: Category, Product, Variant, Attribute, Brand, Inventory, Media (S3 port/mock), Search
  (PostgreSQL FTS behind SearchService); admin catalogue CRUD endpoints + CSV bulk import; storefront
  home/listing/PDP/search pages; seed catalogue across apparel/grocery/electronics/handicraft.
- **Demo**: Browse categories, search/filter/sort, view PDP with variants & stock.
- **Depends on**: U1, U2.

### U4 — cart-checkout
- **Responsibility**: Cart, pricing/tax/coupon engine, checkout, Razorpay payment.
- **Includes**: Cart (guest+user, merge), Pricing (pure), Tax (GST split, pure), Coupon (pure eval),
  Checkout orchestrator (idempotent), Payment (Razorpay port + mock, webhook verification), COD;
  storefront cart + checkout pages + payment result pages.
- **Demo**: Add to cart → checkout preview with tax/coupon → place order → pay (sandbox/mock) → webhook
  confirms.
- **Depends on**: U1, U2, U3.

### U5 — orders-fulfilment
- **Responsibility**: Order lifecycle, invoices, shipping, returns, refunds.
- **Includes**: Order (state machine), Invoice (GST PDF via worker), Fulfilment (ShipRocket port + mock:
  serviceability/AWB/tracking/RTO), Returns, Refund (source/wallet); storefront order list/detail/track/
  return pages; admin order/fulfilment endpoints.
- **Demo**: Post-payment order confirmed → invoice generated → shipment/AWB → tracking timeline → cancel/
  return → refund.
- **Depends on**: U1, U2, U3, U4.

### U6 — engagement
- **Responsibility**: Post-purchase and engagement features.
- **Includes**: Wishlist, Review/Q&A (verified-purchase, moderation), Wallet/Loyalty/Referral (ledger,
  balance≥0), Notification (email/SMS/WhatsApp/push ports + in-app centre + templates), CMS
  (banners/blog/legal pages), AbandonedCart automation; storefront wishlist/reviews/wallet/notification
  UI + CMS pages.
- **Demo**: Add wishlist, post review post-delivery, earn/redeem wallet, receive notifications, view CMS.
- **Depends on**: U1, U2, U3, U5 (order for verified-purchase/notifications).

### U7 — admin
- **Responsibility**: Back-office panel assembling admin capabilities over all domains.
- **Includes**: Admin UI shell + RBAC-guarded routes; Dashboard (KPIs/graphs/alerts); Catalogue &
  Inventory management UI; Order & Fulfilment management UI (labels/manifest/AWB/returns/refunds);
  Marketing (coupons/campaigns/banners/CMS); Customer management; Reporting (sales/GST/inventory/returns/
  customer) + Excel/CSV/PDF export; Settings (store/shipping/payment/templates) + admin audit log.
- **Demo**: Full admin workflow across catalogue, orders, marketing, customers, reports, settings.
- **Depends on**: U1–U6.

## Requirement Coverage Check
- FR-1 → U2; FR-2/FR-3 → U3; FR-4 → U4; FR-5 → U5; FR-6 → U6; FR-7..FR-13 → U7 (with domain endpoints
  built in U2–U6). NFR-1..NFR-6 are cross-cutting: established in U1 and enforced in every unit.
- All 31 application-design components are assigned to exactly one unit (platform-core cross-cutting →
  U1; each domain component → its owning unit; Reporting/Settings/Admin UI → U7).
