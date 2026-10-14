# Requirements — Belzo eMart E-Commerce Portal (Phase 1)

## Intent Analysis Summary

- **User Request**: Build a production-ready e-commerce portal based on the supplied master build prompt.
- **Request Type**: New Project (greenfield).
- **Scope Estimate**: System-wide — a full application stack (frontend storefront, backend API, admin
  panel, database, integrations).
- **Complexity Estimate**: Complex (multi-module system with payments, catalogue, orders, and India-
  specific compliance).
- **Project Type**: Greenfield, single-vendor B2C.

## Product Vision

**Belzo eMart** is a single-vendor, business-to-consumer e-commerce portal serving customers Pan-India,
selling across multiple product categories (apparel, grocery/FMCG, electronics, handicraft/home decor).
The platform launches with a responsive, SEO-friendly, PWA-capable web storefront and an admin/back-office
panel. It supports English and Hindi, transacts in INR, and integrates Razorpay for payments and
ShipRocket for logistics.

## Confirmed Project Variables (from clarification)

| Variable | Value |
|---|---|
| Brand name | Belzo eMart |
| Business type | B2C, single-vendor |
| Product categories | Apparel, Grocery/FMCG, Electronics, Handicraft/Home Decor |
| Target geography | Pan-India |
| Languages | English + Hindi (i18n from day one) |
| Currency | INR |
| Web + backend stack | Next.js (React) frontend + Node.js (NestJS) backend + PostgreSQL |
| Mobile app | Flutter — **deferred to a later phase** (not Phase 1) |
| Payment gateway | Razorpay |
| Logistics partner | ShipRocket (aggregator) |
| Hosting | AWS |
| Budget/timeline | Tight — MVP-first, phased delivery |
| Multi-vendor | No — single-vendor; Seller/Vendor Panel out of scope |
| Integrations | Accounts exist; build behind provider abstractions with env-driven sandbox config |

## Scope & Phasing

### In Scope — Phase 1 (this build)
1. **Customer Web Storefront** (responsive, SEO-optimised, PWA-capable).
2. **Admin / Back-office Panel**.
3. **Shared REST API layer** (consumable later by the Flutter app).
4. **PostgreSQL data model** with migrations and seed data.
5. **Razorpay** payment integration (sandbox/test mode, webhook verification).
6. **ShipRocket** logistics integration (sandbox/test mode) for serviceability, AWB, tracking.
7. **Notifications**: transactional email + SMS + WhatsApp + push abstractions (provider-swappable;
   sandbox/mock by default).
8. **India compliance**: GST-compliant invoicing, DPDP consent/data-rights flows, Consumer Protection
   (E-Commerce) Rules disclosures.

### Deferred — Later Phases (explicitly out of Phase 1 scope)
- **Flutter Android/iOS customer app** (Phase 2) — the Phase 1 API is designed to serve it.
- **Multi-vendor Seller/Vendor Panel** (future, only if business model changes).
- **ERP/accounting sync** (Tally/Zoho/SAP), ONDC and marketplace listing sync.
- **Advanced search engine** (Elasticsearch/Typesense) — Phase 1 uses PostgreSQL full-text search with a
  clean abstraction so a dedicated search service can be added later.
- **Voice search / barcode-QR scan** (mobile-app features).

## Functional Requirements

### FR-1 Onboarding & Account (Customer)
- FR-1.1 Mobile OTP login/signup as the primary method; email + password as secondary.
- FR-1.2 Social login (Google) — abstracted provider; additional providers deferrable.
- FR-1.3 Guest checkout with optional post-purchase account creation.
- FR-1.4 Profile management: name, gender, DOB, profile photo, language preference.
- FR-1.5 Multiple saved addresses (Home/Work/Other) with PIN-code auto-fill of city & state.
- FR-1.6 Saved payment methods via gateway tokenisation only (no raw card data stored).
- FR-1.7 Account deletion & data-download request flow (DPDP Act compliance).

### FR-2 Product Discovery
- FR-2.1 Configurable home page: banners, carousels, category tiles, deal-of-the-day, new arrivals.
- FR-2.2 Category → sub-category navigation with unlimited depth.
- FR-2.3 Search with autocomplete and typo tolerance (PostgreSQL FTS in Phase 1, abstracted).
- FR-2.4 Filters: price range, brand, size, colour, rating, discount %, availability, custom attributes.
- FR-2.5 Sorting: relevance, price low↔high, newest, popularity, rating, discount.
- FR-2.6 Recently viewed, trending, "customers also bought", basic recommendations.

### FR-3 Product Detail Page
- FR-3.1 Multi-image gallery with zoom; optional product video.
- FR-3.2 Variants (size/colour/weight/pack) with variant-wise price, stock, and images.
- FR-3.3 Price block: MRP, selling price, discount %, tax-inclusive indication.
- FR-3.4 Stock status, low-stock urgency, back-in-stock notify-me.
- FR-3.5 Delivery-date estimator by PIN code, COD availability check, shipping charges (via ShipRocket).
- FR-3.6 Description, specification table, size chart, care instructions.
- FR-3.7 Applicable offers/coupons display.
- FR-3.8 Ratings & reviews with photos, verified-purchase badge, helpful votes, moderation.
- FR-3.9 Q&A section, report-product option.
- FR-3.10 Share via WhatsApp/social, add to wishlist, add to compare.
- FR-3.11 Related products, frequently-bought-together bundles.

### FR-4 Cart, Checkout & Payment
- FR-4.1 Persistent cart synced across sessions for logged-in users.
- FR-4.2 Quantity update, save-for-later, remove, bulk actions.
- FR-4.3 Coupon/promo engine with validation and auto-apply best offer.
- FR-4.4 Price breakup: subtotal, discount, shipping, taxes (CGST/SGST/IGST), COD fee, grand total.
- FR-4.5 Address selection / inline add-new.
- FR-4.6 Payment options: UPI, cards, net banking, wallets, EMI (via Razorpay), COD.
- FR-4.7 Webhook-based payment verification — never trust client-side success.
- FR-4.8 Failed-payment retry, payment-pending handling, auto-refund on failure.
- FR-4.9 Order confirmation page + email + SMS + WhatsApp + push notification.

### FR-5 Order Management (Customer)
- FR-5.1 Order list with status filters; order detail with item-wise status.
- FR-5.2 Live tracking via ShipRocket with tracking ID and timeline.
- FR-5.3 GST-compliant invoice download (PDF).
- FR-5.4 Cancel order / cancel individual item with rules by order status.
- FR-5.5 Return / replace / exchange request with reason, images, pickup scheduling.
- FR-5.6 Refund status tracking (to source / wallet).
- FR-5.7 One-tap re-order.

### FR-6 Engagement
- FR-6.1 Wishlist, price-drop alert, back-in-stock alert.
- FR-6.2 Loyalty points / cashback wallet, referral programme with unique code.
- FR-6.3 Push notifications, in-app notification centre, promotional banners.
- FR-6.4 Post-delivery review prompts.
- FR-6.5 Customer support: ticket raise, FAQ, WhatsApp support link. (Live chat/chatbot deferrable.)

### FR-7 Admin — Dashboard
- FR-7.1 Live KPIs: today's revenue, orders, AOV, conversion, cart abandonment, new users.
- FR-7.2 Sales graphs (day/week/month/custom), top products/categories.
- FR-7.3 Low-stock, pending-order, failed-payment, return alerts.

### FR-8 Admin — Catalogue Management
- FR-8.1 Category CRUD with images, SEO fields, display order.
- FR-8.2 Product CRUD: title, SKU, HSN code, brand, attributes, variants, images, video, description.
- FR-8.3 Bulk product upload/update via CSV/Excel with validation and error report.
- FR-8.4 Bulk price & stock update.
- FR-8.5 Draft/published/archived states.
- FR-8.6 Inventory: stock in/out log, reorder level, stock audit trail.
- FR-8.7 Masters: tax (GST by HSN), shipping-class, attribute, brand.

### FR-9 Admin — Order & Fulfilment
- FR-9.1 Order list with advanced filters, search, bulk actions, export.
- FR-9.2 Order detail: customer, items, payments, shipping, notes, activity log.
- FR-9.3 Status workflow: Pending → Confirmed → Packed → Shipped → Out-for-delivery → Delivered.
- FR-9.4 Invoice, shipping label, packing slip generation & printing.
- FR-9.5 Courier assignment and AWB generation via ShipRocket, pickup scheduling.
- FR-9.6 Return/RTO handling, refund initiation & reconciliation.

### FR-10 Admin — Marketing & Promotions
- FR-10.1 Coupon engine: flat/percentage/BOGO/free-shipping, usage limits, user/category-specific,
  min-order value, validity window.
- FR-10.2 Campaign scheduler, flash sale with countdown.
- FR-10.3 Banner/slider/popup management by placement and schedule.
- FR-10.4 Email/SMS/WhatsApp/push campaign builder with templates and segmentation.
- FR-10.5 Abandoned-cart recovery automation.
- FR-10.6 SEO management: meta fields, slugs, canonical, sitemap.xml, robots.txt, schema.org markup.
- FR-10.7 Blog/CMS pages (About, Contact, Policies, Landing pages).

### FR-11 Admin — Customer Management
- FR-11.1 Customer list, profile, order history, wallet, notes, block/unblock.
- FR-11.2 Customer segments and tags.

### FR-12 Admin — Reports & Analytics
- FR-12.1 Sales report (by date, product, category, location, payment mode).
- FR-12.2 GST/tax report, HSN summary, invoice register.
- FR-12.3 Inventory report, stock ageing, dead stock.
- FR-12.4 Returns & refunds report, RTO analysis.
- FR-12.5 Customer report: new vs repeat, LTV.
- FR-12.6 Payment reconciliation report.
- FR-12.7 All reports exportable to Excel/CSV/PDF.

### FR-13 Admin — System Settings
- FR-13.1 Role-based access control with granular permissions and admin activity audit log.
- FR-13.2 Store settings: logo, currency, timezone, business hours, contact, GSTIN, address.
- FR-13.3 Shipping settings: zones, rates, free-shipping threshold, serviceable PIN codes, weight slabs.
- FR-13.4 Payment settings: gateway keys, COD rules, COD limits by PIN.
- FR-13.5 Notification templates (email/SMS/WhatsApp/push) with variables.
- FR-13.6 Legal pages: Terms, Privacy Policy, Return & Refund, Shipping Policy.
- FR-13.7 Maintenance mode, cache management.

## Non-Functional Requirements

### NFR-1 Security (Security Baseline extension — ENABLED, blocking)
- NFR-1.1 HTTPS everywhere; HSTS; secure/httpOnly/sameSite cookies; CSRF & XSS protection (SECURITY-04).
- NFR-1.2 Input validation and parameterised queries on every endpoint (SECURITY-05).
- NFR-1.3 Password hashing with adaptive algorithm (argon2/bcrypt); JWT with refresh-token rotation
  (SECURITY-12).
- NFR-1.4 Rate limiting, brute-force lockout, CAPTCHA on sensitive forms (SECURITY-11, SECURITY-12).
- NFR-1.5 PCI-DSS via gateway tokenisation — no card data stored (SECURITY-01).
- NFR-1.6 Role-based authorisation on every API endpoint, object-level (IDOR) checks (SECURITY-08).
- NFR-1.7 Encryption at rest and in transit for all data stores (SECURITY-01).
- NFR-1.8 Structured application logging with correlation IDs; no secrets/PII in logs (SECURITY-03).
- NFR-1.9 Security event alerting and tamper-evident audit logs, ≥90-day retention (SECURITY-14).
- NFR-1.10 Dependency pinning, lock files, vulnerability scanning, SBOM (SECURITY-10).
- NFR-1.11 Secrets via a secrets manager; no hardcoded credentials (SECURITY-12).
- NFR-1.12 Fail-closed error handling with a global handler; generic user-facing errors (SECURITY-15).
- NFR-1.13 Security headers on all HTML endpoints; SRI on external scripts (SECURITY-04, SECURITY-13).

### NFR-2 Compliance (India)
- NFR-2.1 GST-compliant invoicing: GSTIN, HSN, place of supply, CGST/SGST/IGST split.
- NFR-2.2 DPDP Act 2023: consent capture, purpose limitation, data-deletion & data-download rights.
- NFR-2.3 Consumer Protection (E-Commerce) Rules 2020: seller details, country of origin, grievance
  officer details, no dark patterns.
- NFR-2.4 Legal Metrology declarations on packaged products.

### NFR-3 Performance & Scale
- NFR-3.1 Page load under 3s on 4G; Core Web Vitals in green.
- NFR-3.2 Image optimisation (WebP, lazy loading, CDN delivery).
- NFR-3.3 Redis caching, database indexing, query optimisation, connection pooling.
- NFR-3.4 Stateless API servers; queue workers for heavy jobs (email, invoice, webhook processing).
- NFR-3.5 MVP scale target: ~1,000 concurrent users and up to ~50,000 SKUs (tunable).

### NFR-4 Resiliency (Resiliency Baseline extension — ENABLED, blocking)
- NFR-4.1 RTO/RPO: hours — **Backup & Restore** DR strategy (RESILIENCY-02, RESILIENCY-11).
- NFR-4.2 Topology: **single-region, multi-zone** on AWS (RESILIENCY-08).
- NFR-4.3 Change management: **propose lightweight process** (change record + approval + rollback note)
  (RESILIENCY-03).
- NFR-4.4 CI/CD: **propose pipeline (GitHub Actions)** with automated build/test/deploy (RESILIENCY-04).
- NFR-4.5 Rollback: **version-pinned redeploy** of previous artifact/IaC (RESILIENCY-04).
- NFR-4.6 Deployment style: **rolling** (RESILIENCY-04).
- NFR-4.7 Observability: metrics, structured logs, health checks, dashboards (RESILIENCY-05,
  RESILIENCY-06).
- NFR-4.8 Auto-scaling with min/max limits; dependency timeouts and circuit breakers; graceful
  degradation (RESILIENCY-09, RESILIENCY-10).
- NFR-4.9 Automated encrypted backups with defined retention; restore validation (RESILIENCY-12).
- NFR-4.10 Incident response: **propose lightweight IR + COE process** (RESILIENCY-15).
- NFR-4.11 Resiliency testing: **defer scenarios to Operations phase** (RESILIENCY-14).

### NFR-5 Quality & Operations
- NFR-5.1 Automated tests: unit, integration, API, and critical E2E flows.
- NFR-5.2 Property-based testing (PBT extension — ENABLED, blocking) for pricing, tax, coupon,
  inventory, serialization logic (PBT-01 through PBT-10). Framework: **fast-check** (JS/TS).
- NFR-5.3 CI/CD with staging and production environments.
- NFR-5.4 Error monitoring (Sentry), uptime monitoring, structured logging.
- NFR-5.5 Automated daily database backups with documented restore drill.
- NFR-5.6 Analytics: GA4, Meta Pixel, in-app event tracking.

### NFR-6 Accessibility & UX
- NFR-6.1 WCAG 2.1 AA target: keyboard navigation, screen-reader labels, sufficient contrast.
  (Full conformance requires manual assistive-tech testing and expert review — flagged.)
- NFR-6.2 Responsive across mobile/tablet/desktop.
- NFR-6.3 Multi-language (English + Hindi) via i18n framework.
- NFR-6.4 Graceful error states and offline-friendly PWA behaviour.

## Integrations (Phase 1)

| Area | Integration | Phase 1 Approach |
|---|---|---|
| Payments | Razorpay (UPI, cards, net banking, wallets, EMI, refunds) | Provider abstraction, sandbox keys via env, webhook verification |
| Logistics | ShipRocket (serviceability, AWB, tracking, RTO) | Provider abstraction, sandbox keys via env |
| SMS | DLT-approved transactional SMS | Provider abstraction; mock by default, swappable |
| Email | Transactional email (SES/SMTP) | Provider abstraction; SES on AWS |
| WhatsApp | WhatsApp Business API | Provider abstraction; mock by default |
| Push | FCM | Provider abstraction |
| Analytics | GA4, Meta Pixel, GTM | Client-side tags configurable via env |
| Storage/CDN | S3-compatible storage + CloudFront CDN | AWS S3 + CloudFront |

## Assumptions
- A-1 Live third-party credentials are supplied at deploy time; the build runs against sandbox/mock
  providers with clear, env-driven integration seams.
- A-2 Flutter mobile app and multi-vendor seller panel are separate future phases; the Phase 1 REST API is
  designed to be reusable by the app.
- A-3 Phase 1 search uses PostgreSQL full-text search behind a search abstraction; a dedicated search
  engine (Typesense/Elasticsearch) can be swapped in later without API changes.
- A-4 "Build the most complete version reasonable" is balanced against the tight-budget/MVP constraint:
  depth is prioritised on the core commerce path (catalogue → cart → checkout → payment → order →
  fulfilment) with admin support for those flows.

## Out of Scope (Phase 1)
- Flutter mobile app build and Play Store release.
- Multi-vendor Seller/Vendor Panel and seller payouts/commission/KYC.
- ERP/accounting/POS/WMS sync; ONDC; marketplace listing sync.
- Dedicated search-engine service; voice search; barcode/QR scan.
- Live chat / AI chatbot support (ticket + FAQ + WhatsApp link only in Phase 1).

## Key Requirements Summary
Belzo eMart Phase 1 delivers a single-vendor B2C web storefront plus admin panel on a Next.js + NestJS +
PostgreSQL stack hosted on AWS, integrating Razorpay and ShipRocket, with English/Hindi i18n and INR. All
three quality extensions (Security, Resiliency, Property-Based Testing) are enabled as blocking
constraints. The core commerce path receives the deepest implementation; the mobile app, multi-vendor
seller panel, ERP sync, and dedicated search are explicitly deferred, with API and abstraction seams left
in place so they can be added without rework.
