# Application Design — Belzo eMart (Phase 1, consolidated)

This document consolidates the Belzo eMart Phase 1 application design. Detailed component definitions,
method signatures, service orchestration, and dependency mappings live in the companion files in this
folder:
- `components.md` — component identification and responsibilities
- `component-methods.md` — interface/method signatures
- `services.md` — service orchestration and business transactions
- `component-dependency.md` — dependency matrix and data flows

## 1. Architecture Decisions (from application-design-plan.md)

| Decision | Choice |
|---|---|
| Backend architecture | Modular monolith (NestJS), domain modules, splittable later |
| Frontend structure | Single Next.js app; route groups `(shop)` + `/admin` (role-guarded) |
| API style | REST, documented with OpenAPI/Swagger |
| Repository layout | Monorepo: `apps/web`, `apps/api`, `packages/shared`, `infra/` |
| Web auth | JWT access + refresh-token rotation; refresh in httpOnly/secure/sameSite cookie |
| Identity separation | Separate `admin_users` (email+password+MFA, RBAC) and `customers` (OTP/email/social) |
| Async processing | Redis + BullMQ; workers as separate process |
| Search (Phase 1) | PostgreSQL full-text search behind `SearchService` abstraction |
| External integrations | Ports (interfaces) + concrete adapters + Mock adapters, env-selected |

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (React, TypeScript), PWA, next-intl (EN/HI), Tailwind (or CSS modules) |
| Backend | NestJS (Node.js, TypeScript), REST, OpenAPI (Swagger) |
| Shared | TypeScript types + zod schemas in `packages/shared` |
| Database | PostgreSQL (AWS RDS), Prisma or TypeORM migrations |
| Cache/Queue | Redis (AWS ElastiCache) + BullMQ |
| Storage/CDN | AWS S3 + CloudFront |
| Email | AWS SES (adapter) |
| Payments | Razorpay (adapter) + Mock |
| Logistics | ShipRocket (adapter) + Mock |
| SMS / WhatsApp / Push | Provider adapters + Mock; FCM for push |
| Testing | Jest (unit/integration), fast-check (PBT), Playwright (E2E) |
| CI/CD | GitHub Actions |
| Hosting | AWS, single-region multi-zone; ECS/Fargate (or equivalent) |

## 3. Component Inventory (summary)

Platform-core (cross-cutting): Config, SecurityMiddleware, Auth/RBAC guards, ValidationPipe,
RateLimiter, Logger, GlobalErrorHandler, I18n, Queue, Health.

Domain: Identity, Catalogue, Inventory, Cart, Pricing, Coupon, Checkout, Payment, Order, Fulfilment,
Returns, Review, Wallet, Notification, CMS, Media, Search, Reporting, AdminSettings.

Frontend: Storefront UI, Admin UI, Shared package.

See `components.md` for full responsibilities and interfaces.

## 4. Service Orchestration (summary)

Orchestrators: CheckoutOrchestrator, PaymentReconciliationService, FulfilmentOrchestrator,
ReturnsOrchestrator, NotificationDispatcher, AbandonedCartService, CatalogueAdminService,
ReportingService. See `services.md` for flows and the business-transaction map.

## 5. Cross-Cutting Concern Mapping to Extensions

### Security Baseline (enabled)
- Auth/RBAC guards + object-level checks (SECURITY-08); JWT rotation, argon2, brute-force protection,
  MFA for admins (SECURITY-12); ValidationPipe + parameterized queries (SECURITY-05); security headers
  (SECURITY-04); structured logging w/o secrets (SECURITY-03); encryption at rest/in transit
  (SECURITY-01); secrets manager, no hardcoded creds (SECURITY-12); global fail-closed error handling
  (SECURITY-15); dependency pinning + scanning + SBOM (SECURITY-10); security-critical logic isolated in
  Identity/Payment modules (SECURITY-11).

### Resiliency Baseline (enabled)
- Workload classification and dependency map (RESILIENCY-01, this doc + dependency matrix); RTO/RPO
  Backup & Restore (RESILIENCY-02/11); single-region multi-zone (RESILIENCY-08); health checks
  (RESILIENCY-06); timeouts + circuit breakers + graceful degradation on all ports (RESILIENCY-10);
  BullMQ decoupling; auto-scaling and backups addressed in Infrastructure Design (RESILIENCY-09/12).

### Property-Based Testing (enabled)
- Pure-function targets: Pricing.computeTotals, Tax.computeGst, Coupon.validate (invariants: discount ≤
  price, totals non-negative, GST split sums to tax) — PBT-01/03.
- Round-trip: `packages/shared` DTO (de)serialization and money/paise conversions — PBT-02.
- Idempotence: Checkout.place with idempotency key; Wallet.earn/redeem by ref — PBT-04.
- Stateful: Cart and Order state machine command sequences — PBT-06.
- Framework: fast-check (PBT-09), selected in NFR Requirements.

## 6. Workload Criticality (RESILIENCY-01)

| Component group | Criticality | Impact if unavailable |
|---|---|---|
| Checkout, Payment, Order | Critical | Direct revenue loss; abandoned purchases |
| Catalogue, Search, Cart | High | Cannot browse/select; funnel blocked |
| Identity | High | Cannot log in / checkout as user |
| Fulfilment, Returns | Medium | Delayed shipping/returns, recoverable |
| Notification, Review, Wallet, CMS | Medium/Low | Degraded experience, not blocking sales |
| Reporting, AdminSettings | Low (customer), High (ops) | Ops visibility impacted |

## 7. Traceability
Every component maps to requirements FR-1..FR-13 and NFR-1..NFR-6 (see `components.md` per-component FR
references). This design feeds Units Generation, which groups these components into buildable units in the
dependency order documented in `component-dependency.md`.
