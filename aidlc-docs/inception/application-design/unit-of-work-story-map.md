# Unit → Requirement / Component Map — Belzo eMart (Phase 1)

Maps each unit to the functional requirements it satisfies and the application-design components it owns.
(User Stories stage was skipped; FR IDs from `requirements.md` serve as the traceability anchor.)

## U1 — platform-core
- **Requirements**: Cross-cutting foundations for NFR-1 (Security), NFR-3 (Performance/caching/queue),
  NFR-4 (Resiliency/health/observability), NFR-5 (testing/CI), NFR-6 (i18n/PWA scaffold).
- **Components**: Config, SecurityMiddleware, Auth/RBAC guards (skeleton), ValidationPipe, RateLimiter,
  Logger, GlobalErrorHandler, I18n, QueueModule, HealthModule; monorepo + `packages/shared` + Next.js
  shell.

## U2 — identity
- **Requirements**: FR-1.1–1.7 (auth, profile, addresses, saved payment tokenisation hook, DPDP),
  FR-13.1 (RBAC/admin audit hook), NFR-1.3/1.4/1.6 (auth security), NFR-2.2 (DPDP).
- **Components**: Identity, Address, AdminUser, Rbac.

## U3 — catalogue
- **Requirements**: FR-2.1–2.6 (discovery/search/filter/sort), FR-3.1–3.4/3.6/3.11 (PDP, variants,
  stock), FR-8.1–8.7 (admin catalogue/inventory/masters — backend endpoints), NFR-3.2 (media/CDN).
- **Components**: Category, Product, Variant, Attribute, Brand, Inventory, Media, Search.

## U4 — cart-checkout
- **Requirements**: FR-4.1–4.9 (cart, coupon, price breakup/tax, payment, webhook verify, confirmation),
  FR-3.5 (delivery/COD estimate at PDP via serviceability), FR-3.7 (offers), NFR-2.1 (GST split),
  NFR-1.5 (PCI tokenisation).
- **Components**: Cart, Pricing, Tax, Coupon, Checkout, Payment.

## U5 — orders-fulfilment
- **Requirements**: FR-5.1–5.7 (orders, tracking, invoice, cancel, returns, refund, reorder),
  FR-9.2–9.6 (admin order/fulfilment backend), NFR-2.1 (GST invoice).
- **Components**: Order, Invoice, Fulfilment, Returns, Refund.

## U6 — engagement
- **Requirements**: FR-3.8–3.10 (reviews/Q&A/share/wishlist), FR-6.1–6.5 (wishlist/alerts/wallet/
  referral/notifications/support), FR-10.3/10.5/10.7 (banners/abandoned-cart/CMS backend), FR-13.5
  (notification templates).
- **Components**: Review, QnA, Wallet, Referral, Notification, CMS, Banner.

## U7 — admin
- **Requirements**: FR-7 (dashboard), FR-8 (catalogue mgmt UI), FR-9 (order/fulfilment UI), FR-10
  (marketing/promotions UI + SEO), FR-11 (customer mgmt), FR-12 (reports/export), FR-13 (settings/
  RBAC/legal/audit) — admin UI assembled over U2–U6 endpoints.
- **Components**: Admin UI, Dashboard, Reporting, Settings, AuditLog (+ admin screens for all domains).

## Coverage Assertion
- Every FR (FR-1..FR-13) is assigned to at least one unit.
- Every NFR (NFR-1..NFR-6) is established in U1 and enforced across all units per the enabled extensions.
- Every component from `components.md` is owned by exactly one unit.
