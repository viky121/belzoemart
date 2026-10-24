# Delivery Module: Services and Orchestration

## 1. Service list

| Service | Role | Owns |
|---|---|---|
| `JobService` | command side of delivery jobs; the only writer of job status | DeliveryJob, DeliveryAssignment, DeliveryEvent |
| `OrderSyncService` | keeps `Order`, `Shipment`, `TrackingEvent` in step with the job | none (writes to orders tables) |
| `DeliveryOtpService` | create, send, verify delivery OTP | DeliveryOtp |
| `CollectionService` | cash and UPI QR collection, marks `Payment` captured | DeliveryCollection, DeliveryQrCode |
| `LedgerService`, `SettlementService`, `EarningsService` | cash and earnings books | DeliveryCashEntry, DeliverySettlement, DeliveryEarning |
| `ProofService` | proof files and rule check | DeliveryProof |
| `PartnerService`, `ZoneService`, `PartnerAuthService` | partner accounts, coverage, login | DeliveryPartner, zones |
| `TrackingService` | public view and rating | DeliveryRating |
| `DeliveryNotifier` | customer e-mail and in-app messages | none |
| `DeliverySettingsService` | typed settings | `Setting` rows `delivery.*` |
| `DeliveryWorker` | queue consumer and schedulers | none |

Rule: only `JobService.transition` changes `DeliveryJob.status`. Other services are called by it inside the same database transaction (OTP verify, payment check, proof check, order sync, earnings), or after commit through the queue (notifications).

## 2. Orchestration

### 2.1 Assign (admin)
1. `JobService.assign` checks the order is `confirmed` or `packed` (D9), no active job exists, the partner is active.
2. In one transaction: create job (`assigned`), assignment row, event, tracking token; `OrderSyncService.detachMockShipment` cancels any mock shipment; create the `inhouse` Shipment (courier "Belzo Delivery", AWB = job code) with a first TrackingEvent; walk the order to `packed` if it is `confirmed`.
3. After commit: queue `notify:assigned`; write audit entry (`delivery.assign`).
4. The partner sees the job on the next poll (15 s).

### 2.2 Accept, reject, no reply
- `accept`: `assigned` to `accepted`.
- `reject` or timeout: `assigned` to `new`, assignment closed with the reason, admin attention flag set (D6). `expireUnanswered` runs every minute on the worker.

### 2.3 Pick up and route
- `pickUp` moves to `picked_up` (order `shipped`). `startRoute` moves to `out_for_delivery` (order `out_for_delivery`) and issues the delivery OTP (SMS purpose `delivery`, template `5e3e80760d`). Each step adds a TrackingEvent.

### 2.4 Collect payment (COD only)
- Cash: `collectCash` checks the amount equals the due amount, writes `DeliveryCollection`, a ledger entry (`collected`) and marks the COD `Payment` captured (`method: cash`).
- UPI QR: `createQr` calls Razorpay for a single-use fixed-amount QR, stores `DeliveryQrCode` (notes carry the job id) and returns the image. The partner screen polls `qr/status`.
- Razorpay calls the existing webhook. `PaymentService.handleWebhook` verifies the signature, records the event id (idempotent), sees the `qr_code.` prefix and calls `WebhookEventRouter`, which calls `QrPaymentHandler`. It finds the QR by id, checks the amount against the QR and the job, writes `DeliveryCollection` (`upi`), marks the `Payment` captured (`method: upi`). No ledger entry (money went to Razorpay).
- A second payment on the same QR, a payment after the cash path, or after cancel is stored as `needs_refund` and shown on the admin dashboard.

### 2.5 Complete
`complete(otp)` inside one transaction: lock job, check state, `DeliveryOtpService.verify`, check COD paid (or prepaid), `ProofService.satisfies`, move to `delivered`, accrue earnings, `OrderSyncService.apply` (order `delivered`). After commit: queue `notify:delivered`; rating link is in the e-mail.

### 2.6 Fail, return, cancel
- `fail` (reason needed): `failed_attempt`, order stays `out_for_delivery`, customer e-mail `failed`. Admin then reassigns or reschedules (`assigned` again) or marks `returned`.
- `markReturned`: job `returned`; the order effect is decided in Functional Design (the order state machine has no path from out-for-delivery to returned today).
- `cancel`: job `cancelled`, OTP invalidated, open QR closed, Shipment cancelled via the existing `FulfilmentService.cancelShipmentsForOrder`.

### 2.7 Settlement
`SettlementService.settle` (super admin) writes a ledger entry and a settlement row; balance can never go below the real cash in hand unless an adjustment with a reason is recorded.

## 3. Background work (queue `delivery`)

| Job | Every | Does |
|---|---|---|
| `accept-timeout` | 1 min | calls `expireUnanswered` |
| `qr-expiry` | 1 min | marks old QRs `expired`, closes them at Razorpay |
| `partner-stale` | 1 min | sets partners offline when the heartbeat is older than the setting |
| `otp-cleanup` | 1 h | deletes expired OTP rows |
| `notify` | on demand | sends the customer e-mail and in-app message with retries |

Jobs use fixed scheduler ids so repeated worker starts do not duplicate them. Every job is idempotent. The worker writes a heartbeat row that `/health/ready` reports.

## 4. Cross-cutting patterns

- Transactions: one per command; row lock on the job (`SELECT ... FOR UPDATE`) plus compare-and-set on the old status.
- Idempotency: webhook events by `WebhookEvent.eventId`; QR payments by Razorpay payment id unique on `DeliveryCollection`; notify jobs by job id and event.
- Audit: admin commands write `AdminAuditLog`; partner status changes write `DeliveryEvent` (append-only).
- Errors to the user are plain (`409` for illegal moves, `403` and `404` for other partners' jobs, `429` for lockouts).
- External calls (Razorpay, SMS) go through the resilient HTTP client and sit outside the database transaction where possible; if the SMS fails the OTP row still exists and the partner can resend.
- Security guards: global `JwtAuthGuard` rejects partner tokens by construction (different secret); partner routes are `@Public()` for that guard and use `PartnerAuthGuard`; admin routes keep `@Roles`.
