# Delivery Module: Analysis of the PHP Source and Conversion Approach

Source: `/home/viky/Downloads/delivery-module` (PHP 8.1, MariaDB, Apache, no Composer/npm). Read: README.md,
DOCUMENTATION.md, API.md, `sql/001_schema.sql`, `config/permissions.php`, folder layout. Size: about 21,500 lines of PHP
under `src/ bin/ cron/ sql/ config/`, plus about 20,000 lines of PHP tests and 18 browser JS files for the partner app.

## 1. What the module does

| Part | PHP implementation | Users |
|---|---|---|
| Admin panel | server-rendered PHP pages (`src/Views/admin`), 5 roles | super_admin, admin, dispatcher, finance |
| Partner app | installable PWA (ES modules, service worker, camera, GPS, signature pad, UPI QR) | delivery partners |
| Customer tracking | public page `/t/{token}` with 30 s poll and a 1 to 5 rating | customers (no login) |
| Order intake | `POST /api/v1/orders` with `X-API-Key`, idempotent, + signed outbound webhooks | the storefront server |
| Background jobs | `cron/run.php` every minute (auto-reassign, retries, SLA alerts, cleanup, integrity) | system |

Core domain rules (all must survive the conversion):

* **Order state machine**: 10 statuses, 15 transitions (`new, assigned, accepted, picked_up, out_for_delivery, arrived, delivered,
  failed_attempt, returned, cancelled`). Applied in one DB transaction with a row lock and compare-and-set.
* **Delivery cannot be completed without the customer's OTP**, not even by an admin. OTP stored only as a peppered hash, resend
  cooldown, wrong-guess lockout, validity windows. `delivered` also needs payment `paid` and proof per setting.
* **Assignment**: manual, bulk and automatic (online, KYC verified, heartbeat fresh, below max active orders, zone match, fewest
  active orders then nearest). Accept or reject within N minutes, timeout returns the order to `new`.
* **COD cash handling**: one collected payment per order, append-only cash ledger per partner, settlements, adjustments, voids,
  partner earnings per delivery.
* **Proof of delivery**: up to 3 photos and a signature per attempt, GPS tagged, geofence soft flag.
* **Notifications**: in-app, e-mail, SMS (Fast2SMS), outbox with retries; **webhooks** with HMAC signature and retries.
* **Reports and CSV**, **append-only audit log**, rate limits, sessions, zones by pincode, partner KYC documents.

## 2. Database (30 tables) and how each maps to Belzo

Belzo already has PostgreSQL + Prisma, money in integer paise, an `Order`/`Payment`/`Shipment` model, admin RBAC
(`AdminUser`, `Role`, `Permission`), BullMQ + Redis, a storage port (local/S3), the Fast2SMS adapter and an audit log.

| PHP table(s) | Belzo target |
|---|---|
| `users`, `roles`, `sessions`, `rate_limits` | reuse Belzo admin auth, RBAC, refresh tokens and throttler; add a separate `DeliveryPartner` login |
| `orders`, `order_items` | NOT duplicated: a thin `DeliveryJob` row points at the existing `Order` (status, assignment, OTP, attempts, tracking token) |
| `assignments`, `order_status_history` | new `DeliveryAssignment`, `DeliveryEvent` |
| `otps` | new `DeliveryOtp` (hash + pepper, same rules) |
| `payments`, `cash_settlements`, `cash_ledger`, `partner_earnings` | new ledger tables; COD collection also marks the existing `Payment` captured |
| `order_proofs`, `partner_documents` | new tables; files go through the existing storage provider |
| `partners`, `partner_zones`, `zones`, `zone_pincodes`, `partner_locations` | new `DeliveryPartner`, `DeliveryZone`, ... |
| `notifications`, `notifications_log` | reuse Belzo `Notification` + queue; outbox only for SMS/e-mail retries |
| `webhooks`, `webhook_deliveries`, `api_keys` | only needed if an external system must call or be called (see question 2) |
| `settings` | reuse Belzo `Setting` with a `delivery.*` prefix |
| `audit_log` | reuse `AdminAuditLog` (the append-only trigger can be added as a DB migration) |
| `cron_heartbeats` | BullMQ repeatable jobs + a health row |

Triggers (`002_triggers.sql`: delivered needs OTP and paid, ledger/audit/history are append-only) become service-level guards
plus Postgres triggers in the Prisma migration, so the rules still hold if someone writes SQL directly.

## 3. Target architecture inside Belzo

```
apps/api   new module  src/modules/delivery/
              state machine, assignment, auto-assigner, otp, payment/cash, proof, tracking,
              partner auth + partner API, admin API, reports, cron (BullMQ repeatables)
           new adapter integrations/shipping/inhouse-delivery.provider.ts  (implements the existing ShippingProvider port)
apps/web   /admin/delivery/*   dashboard, orders, partners, zones, cash, reports, notifications, settings, audit
           /partner/*          mobile-first PWA for delivery partners (manifest + service worker)
           /t/[token]          public customer tracking page (+ link inside "My Orders")
packages/shared   delivery status machine, schemas (zod), money/pincode helpers, shared by API, web and mobile
apps/mobile  optional: show the tracking timeline / OTP in the customer app; partner screens only if chosen
```

PHP to TypeScript replacements: PHP sessions/CSRF become Belzo JWT + refresh cookies; server-rendered views become React
pages; `Deferred` (post-response work) becomes BullMQ jobs; `Fast2SmsClient` becomes the existing Fast2SMS provider (Smart OTP
for the delivery OTP: template `5e3e80760d` is already approved); the 20k lines of PHP tests are re-expressed as Jest tests for
the core rules (state machine, OTP, cash ledger, assignment, money) rather than ported line by line.

## 4. Risks and what the conversion deliberately changes

* A 1:1 port is very large. The recommended path is phases that each ship something usable (see question 1).
* `orders` is duplicated in PHP because the module was standalone. Duplicating it again would cause two sources of truth, so
  the conversion links to the existing `Order` instead, and keeps the delivery-specific state on the delivery job.
* Intake API, API keys and outbound webhooks exist only because the PHP module was a separate system. Inside Belzo they become
  direct service calls; they are kept only if an outside system still needs them.
* SMS other than the OTP needs DLT-approved templates that Belzo does not have yet (registration, password reset and delivery
  OTP are approved). Assignment/cancel/delivered SMS would be skipped until templates exist.
* Browsers need HTTPS for geolocation, camera and service workers; belzoemart.com already serves HTTPS.
* Extensions Security Baseline, Resiliency Baseline and Property-Based Testing stay enabled for this cycle.
