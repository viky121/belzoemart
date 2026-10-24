# Requirements: Delivery Module (U8)

Source analysis: `aidlc-docs/inception/delivery-module/php-module-analysis.md`.
Answers: `delivery-module-questions.md` and `delivery-module-followup-questions.md`.
Depth: Comprehensive. Extensions Security Baseline, Resiliency Baseline and Property-Based Testing stay enabled.

## 1. Intent

Convert the PHP delivery module to TypeScript (NestJS API, Next.js/React web) and build it into Belzo. The shop's own
delivery staff deliver Belzo orders. An admin assigns an order to a partner, the partner delivers it from a phone, and the
customer follows it in My Orders and by e-mail.

## 2. Decisions taken from the answers

| Topic | Decision |
|---|---|
| Delivery | Phased; each phase is usable on its own (Q1) |
| When an order enters delivery | The moment an admin assigns it to a partner. Only that partner sees it (Q3, Q4) |
| Partners | The shop's own staff. Admin creates the account. Mobile number + password; the partner can change it (Q7, F4) |
| Partner app | Mobile-first installable web app (PWA) at `/partner`. Android screens later (F5) |
| Admin access | Existing Belzo admin login and roles with new delivery permissions (F3) |
| Order data | A `DeliveryJob` points at the existing `Order`. No second orders table |
| Mock shipping | Replaced for assigned orders. Order status and the My Orders timeline follow the delivery status (F2) |
| Intake API, API keys, webhooks | Not built. Direct service calls only (F1) |
| Reject or no reply | Order returns to `new` and the admin is notified. No auto-reassign (F6) |
| Who can be picked | Any active partner. Zones only suggest partners (F7) |
| Customer messages | Assigned, cancelled, delivered, failed: e-mail only. Customers without an e-mail are skipped. Delivery OTP: SMS with the approved delivery template `5e3e80760d` (Q9) |
| Payment | Cash, and UPI QR created per order for the exact amount through the Razorpay account that is already connected. Money goes to that Razorpay account (Q10, F8) |
| Tracking | Public link `/t/{token}` plus the timeline in My Orders (website and Android app), rating 1 to 5 after delivery (F9, Q11) |
| Proof | Up to 3 photos and a signature; default "photo or signature", changeable in Settings (Q12) |
| Language | English (Q13) |
| Tests | Core rules with property-based tests where they fit (Q14) |
| Deploy | Only when the user says "deploy" (Q15) |

## 3. Functional requirements

### DL-1 Delivery partners
- DL-1.1 Admin creates, edits, activates and deactivates partners (name, mobile, vehicle, optional e-mail, zones, max active orders).
- DL-1.2 Partner signs in with mobile number and password. Admin sets the first password; the partner can change it. Failed-login lockout and rate limit.
- DL-1.3 Partner sessions are separate from admin and customer sessions. A partner token can never call an admin or customer endpoint.
- DL-1.4 Partner can set themselves online or offline and sends a periodic heartbeat while online. Optional GPS location while on a delivery.
- DL-1.5 Zones: admin defines zones as sets of pincodes and links partners to zones. The assign dialog shows partners covering the order's pincode first.

### DL-2 Assignment
- DL-2.1 From the order detail and the order list, an admin assigns a confirmed or packed order to any active partner. Bulk assign is a Phase 2 item.
- DL-2.2 Creating the assignment creates the `DeliveryJob` (status `assigned`), a tracking token and a delivery OTP, and writes an audit entry.
- DL-2.3 A partner sees only the jobs assigned to them. Nobody else (other partners, customers without the token) sees partner data.
- DL-2.4 Partner accepts or rejects. Reject, or no reply within the accept timeout (setting, default 15 minutes), returns the job to `new` and notifies admins.
- DL-2.5 Admin can reassign a job that is not yet picked up. Every change is recorded as an assignment and an event.

### DL-3 Delivery status machine
- DL-3.1 Statuses: `new, assigned, accepted, picked_up, out_for_delivery, arrived, delivered, failed_attempt, returned, cancelled`, with the same 15 transitions as the PHP module. One database transaction with a row lock and compare-and-set per change.
- DL-3.2 Every change writes an append-only event (who, from, to, time, GPS if given, note).
- DL-3.3 Failed attempt needs a reason. Admin can reschedule or mark the job returned.
- DL-3.4 The state machine is a pure function in `packages/shared` so API, web and mobile use the same rules.

### DL-4 Delivery OTP and proof
- DL-4.1 When the job is created (or the partner marks "out for delivery") the customer gets a 6-digit OTP by SMS (template `5e3e80760d`). The OTP is stored only as a peppered hash.
- DL-4.2 `delivered` is impossible without a correct OTP, for partners and admins alike. Resend cooldown, wrong-guess lockout and expiry as in the PHP module (values become `delivery.*` settings).
- DL-4.3 `delivered` also needs payment collected for COD orders, and proof per setting.
- DL-4.4 Proof: up to 3 photos and a signature through the existing storage provider; type and size checks; GPS tag; geofence soft flag.

### DL-5 Payment collection (COD)
- DL-5.1 Only COD orders need collection. Prepaid orders skip it.
- DL-5.2 Cash: the partner records the amount received. The amount must equal the order total (rounding rules from the PHP module). One collected payment per order.
- DL-5.3 UPI QR: the partner taps "Show QR". The API creates a single-use, fixed-amount Razorpay UPI QR code for the exact due amount and returns its image. The customer scans and pays with any UPI app. The money goes to the Razorpay account configured on the Payments page.
- DL-5.4 The payment is confirmed by Razorpay (webhook `qr_code.credited` or `payment.captured`, verified with the webhook secret and checked against the Razorpay API). The partner never types a UTR and the partner's say-so is never trusted.
- DL-5.5 Confirmed UPI payment marks the existing `Payment` captured, shows "Paid" on the partner screen, and is NOT counted as cash in hand.
- DL-5.6 A QR expires (default 15 minutes) and can be regenerated. If a QR is paid after the job was cancelled or the cash path was used, the payment is flagged for an admin refund through the existing refund flow.
- DL-5.7 Cash ledger per partner: append-only entries (collected, settled, adjustment, void), cash in hand, settlements by admin, partner earnings per delivery (setting: flat amount or percent).

### DL-6 Customer experience
- DL-6.1 My Orders (website and Android app) shows the delivery timeline from the job events and the partner's first name and phone once the job is picked up. The order status follows the job (assigned keeps the order status, picked up gives Shipped, out for delivery gives Out-for-delivery, delivered gives Delivered).
- DL-6.2 Public page `/t/{token}`: timeline, ETA text, partner first name; no address, no phone numbers of the customer; the token is unguessable; rate limited.
- DL-6.3 After delivery the customer can rate 1 to 5 once, with an optional comment.
- DL-6.4 E-mails for assigned, cancelled, delivered and failed, sent through the existing mail provider and queue. No customer without an e-mail causes an error.
- DL-6.5 In-app notification in the existing Belzo `Notification` for the same events.

### DL-7 Admin screens (`/admin/delivery/*`)
- DL-7.1 Phase 1: dashboard (counts by status), delivery jobs list with filters and detail with timeline, partners list and form, zones, cash overview with settlement form, settings (`delivery.*`).
- DL-7.2 Phase 2: reports and CSV export, audit viewer, partner KYC documents, notification log, bulk assign, GPS live map list.
- DL-7.3 Phase 3: everything else from the PHP module that remains useful (SLA alerts, advanced reports, integrity checks).
- DL-7.4 Permissions: `delivery.view`, `delivery.assign`, `delivery.partners`, `delivery.cash`, `delivery.settings` added to the existing RBAC, with seed role mappings.

### DL-8 Background work
- DL-8.1 BullMQ repeatable jobs: accept timeout, QR expiry, stale heartbeat to offline, e-mail retries, cleanup of expired OTPs.
- DL-8.2 A heartbeat row for the delivery worker, shown in the health check.

## 4. Phases

| Phase | Scope |
|---|---|
| 1 | DL-1, DL-2, DL-3, DL-4, DL-5, DL-6, DL-7.1, DL-8 |
| 2 | DL-7.2: reports, CSV, audit viewer, KYC documents, notification log, bulk assign |
| 3 | DL-7.3 and leftovers |

## 5. Non-functional requirements

- NFR-D1 Security: partner password hashing as for customers; delivery OTP and tracking token never logged; per-partner object access checks (a partner cannot read another partner's job); input validation on every endpoint; rate limits on partner login, OTP verify and QR creation; file upload type and size limits; webhook signature verified with a constant-time compare; Postgres triggers keep ledger, event and audit tables append-only; delivered-needs-OTP guard also enforced in the database.
- NFR-D2 Resiliency: Razorpay and SMS calls through the existing resilient HTTP client (timeouts, circuit breaker); webhook handling idempotent by event id; every queue job idempotent with retries and a dead-letter view; partner PWA works through short network drops (queued status updates are not allowed for OTP delivery, which needs the server).
- NFR-D3 Money: integer paise everywhere; property-based tests for rounding, ledger balance and settlement.
- NFR-D4 Performance: partner job list under 300 ms at 500 active jobs; tracking page cacheable for a few seconds.
- NFR-D5 Accessibility and UX: partner screens usable one-handed on a 360 px wide phone, large touch targets, sunlight-readable contrast, no horizontal scrolling.
- NFR-D6 Testing: Jest tests for the state machine, delivery OTP, cash ledger, assignment, money, permissions and the QR payment flow, with property-based tests (fast-check) for the state machine, ledger and money.
- NFR-D7 Deploy: nothing is deployed until the user says "deploy".

## 6. Risks and open points to verify

- Razorpay QR Codes must be enabled on the merchant's Razorpay account (live and test). If it is not, the API returns an error and the partner app shows "UPI QR is not available, collect cash". To be tested with the real keys in the design or build step.
- A QR code is not tied to a Razorpay order, so the existing order-based payment pipeline needs a small separate path for QR payments (new webhook branch, matched through QR notes holding the job id).
- Old customer accounts without an e-mail get no assigned or delivered messages. The in-app notification and the My Orders timeline still show the status.
- The partner needs HTTPS for GPS, camera and the service worker. belzoemart.com serves HTTPS.
- Partner password reset is done by an admin in Phase 1 (no SMS template for it).

## 7. Out of scope

Intake API, API keys, outbound webhooks, auto-assignment, auto-reassign, SMS for assigned, cancelled, delivered and failed, Hindi screens, partner screens inside the Android app, multi-store use.
