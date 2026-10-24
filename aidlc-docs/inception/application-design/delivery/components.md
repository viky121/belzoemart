# Delivery Module: Components

Decisions applied: D1 one `DeliveryModule`, D2 job owns an `inhouse` `Shipment`, D3 role split, D4 separate partner JWT secret, D5 BullMQ repeatables, D6 dashboard badges, D7 polling, D8 public unguessable proof URLs, D9 assign only confirmed or packed orders.

## 1. Where things live

```
packages/shared/src/delivery/
  status.ts        statuses, transitions, labels, mapping to order and tracking status (pure)
  money.ts         paise helpers, COD due, earnings calculation (pure)
  schemas.ts       zod schemas shared by API and web
apps/api/src/modules/delivery/
  partners/        partner accounts, zones, partner auth
  jobs/            assignment, status changes, order and shipment sync
  otp/             delivery OTP
  collection/      cash, UPI QR, ledger, settlements, earnings
  proof/           proof photos and signature
  tracking/        public tracking view, rating
  notify/          customer e-mail and in-app messages
  settings/        delivery.* settings
  admin/           admin controllers
  partner-api/     partner controllers
  worker/          BullMQ consumer and repeatable jobs
apps/api/src/integrations/payment/   QR methods added to the Razorpay adapter
apps/web/src/app/admin/delivery/     admin screens
apps/web/src/app/partner/            partner PWA
apps/web/src/app/t/[token]/          public tracking page
```

## 2. Components

### C1 PartnerRegistry (partners/)
- Purpose: delivery partner accounts and their coverage.
- Responsibilities: create, edit, activate, deactivate partners; set and change password; zones and pincode coverage; online or offline flag and heartbeat; max active jobs.
- Interface: `PartnerService`, `ZoneService`.

### C2 PartnerAuth (partners/)
- Purpose: separate login realm for partners.
- Responsibilities: mobile + password login, lockout (5 failures in 15 minutes), refresh token rotation with reuse detection, logout, password change, forced sign-out when a partner is deactivated.
- Uses its own secret `JWT_PARTNER_SECRET`, principal kind `partner`, refresh cookie `belzo_prt` (httpOnly, sameSite strict, path `/api/v1/partner`).
- Interface: `PartnerAuthService`, `PartnerAuthGuard`, `@CurrentPartner()`.

### C3 DeliveryStateMachine (shared)
- Purpose: the single definition of statuses and legal moves, pure and side-effect free.
- Responsibilities: 10 statuses and 15 transitions; who may trigger a move (partner, admin, system); which moves need a reason, OTP, payment or proof; mapping each job status to a tracking label and to an order status.
- Interface: `canMove(from, to, actor)`, `requirementsFor(to)`, `toTrackingStatus(status)`, `toOrderStatus(status)`.

### C4 DeliveryJobs (jobs/)
- Purpose: the delivery job linked to an existing `Order`.
- Responsibilities: assign, reassign, accept, reject, accept timeout; every status change in one transaction with a row lock and compare-and-set; append events; create and update the `inhouse` Shipment and its TrackingEvents; walk the Order status forward; cancel the mock shipment on assignment; reject assignment of orders that are not `confirmed` or `packed`.
- Interface: `JobService` (commands), `JobQueryService` (partner-scoped and admin queries), `OrderSyncService`.

### C5 DeliveryOtp (otp/)
- Purpose: proof that the customer received the parcel.
- Responsibilities: generate a 6-digit code, store only a peppered hash, send by SMS (purpose `delivery`), resend cooldown, wrong-guess lockout, expiry, verify inside the delivered transition.
- Interface: `DeliveryOtpService`.

### C6 Collection (collection/)
- Purpose: money collected for COD orders.
- Responsibilities: cash collection with exact-amount check; Razorpay UPI QR creation for the exact due amount; QR expiry and regeneration; confirm QR payments from the Razorpay webhook; mark the existing `Payment` captured; flag late or duplicate QR payments for refund.
- Interface: `CollectionService`, `QrPaymentHandler` (registered with the webhook router).

### C7 CashLedger (collection/)
- Purpose: who holds how much cash.
- Responsibilities: append-only cash ledger per partner (collected, settled, adjustment, void), settlements recorded by super admin, partner earnings per delivery, cash in hand view. UPI money never enters the ledger.
- Interface: `LedgerService`, `SettlementService`, `EarningsService`.

### C8 Proof (proof/)
- Purpose: evidence of delivery.
- Responsibilities: up to 3 photos and a signature per attempt through the storage port; file-type check by content, size limits, GPS tag, geofence soft flag; evaluate the proof rule from settings.
- Interface: `ProofService`.

### C9 Tracking (tracking/)
- Purpose: customer-facing view.
- Responsibilities: public view by token (no address, no customer phone), 1 to 5 rating once after delivery. My Orders needs no new code because of the `inhouse` Shipment (D2).
- Interface: `TrackingService`, `PublicTrackingController`.

### C10 DeliveryNotifier (notify/)
- Purpose: customer messages for assigned, cancelled, delivered and failed.
- Responsibilities: e-mail plus in-app notification only. Never passes a phone number, so no SMS or WhatsApp. Skips customers without an e-mail. Retries through the queue.
- Interface: `DeliveryNotifier.notify(jobId, event)`.

### C11 DeliverySettings (settings/)
- Purpose: typed `delivery.*` settings with defaults.
- Keys: `delivery.acceptTimeoutMinutes` (15), `delivery.qrValidityMinutes` (15), `delivery.proofRule` (`photo_or_signature`), `delivery.otpTtlMinutes` (10), `delivery.otpMaxAttempts` (5), `delivery.otpResendSeconds` (30), `delivery.heartbeatStaleMinutes` (5), `delivery.earningsMode` (`flat`), `delivery.earningsValue` (0), `delivery.geofenceMeters` (500).
- Interface: `DeliverySettingsService.get()`, `.update(actorId, patch)`.

### C12 DeliveryWorker (worker/)
- Purpose: background work in the existing worker process.
- Repeatable jobs on queue `delivery`: `accept-timeout` (1 min), `qr-expiry` (1 min), `partner-stale` (1 min), `otp-cleanup` (hourly). Event jobs: `notify`. Writes a heartbeat row read by the health check.
- Interface: `DeliveryWorker`.

### C13 AdminDeliveryApi (admin/)
- Controllers under `admin/delivery/*`. `order_manager` and `super_admin`: dashboard, jobs, assign, partners, zones. `super_admin` only: cash, settlements, earnings, settings (D3).

### C14 PartnerApi (partner-api/)
- Controllers under `partner/*`. Every query is scoped by the partner id from the token, so a partner can never read another partner's job.

### C15 RazorpayQrAdapter (integrations/payment)
- Adds `createUpiQr`, `closeQr` and QR event parsing to the existing Razorpay adapter and the `PaymentProvider` port. The mock provider gets a fake QR for development.

### C16 WebhookEventRouter (common or checkout)
- Small registry: `register(eventPrefix, handler)`. The existing `PaymentService.handleWebhook` hands events that start with `qr_code.` to the registered handler. This keeps checkout free of any import from delivery.

### C17 Web screens
- Admin: dashboard, jobs list and detail, partners, zones, cash, settings, "Assign" button on the order detail.
- Partner PWA: login, jobs, job detail, status actions, OTP entry, proof, cash or QR, online switch, password change.
- Public: `/t/[token]`.

## 3. Changes to existing code (kept small)

| Where | Change |
|---|---|
| `FulfilmentService.createShipment` | Skip when an active `DeliveryJob` exists for the order |
| `OrdersWorker` SHIPMENTS | No change (calls the method above) |
| `PaymentService.handleWebhook` | Route `qr_code.*` events to the router |
| `PaymentProvider` port and Razorpay adapter | QR methods and QR event parsing |
| `packages/shared` `TRACKING_STATUS_LABELS`, `TRACKING_PROGRESS_MAP` | Labels for `assigned`, `accepted`, `arrived`, `failed_attempt` |
| `ADMIN_ROLES` | No change (D3 reuses `order_manager`, `super_admin`) |
| `QUEUES` | Add `DELIVERY` |
| `NotificationType` | Add `delivery.assigned`, `delivery.cancelled`, `delivery.delivered`, `delivery.failed` |
| Prisma | New models (see below) and a migration with append-only triggers |
| `docker-compose.prod.yml` and `env.schema.ts` | `JWT_PARTNER_SECRET`, `DELIVERY_OTP_PEPPER` |

New Prisma models: `DeliveryPartner`, `DeliveryZone`, `DeliveryZonePincode`, `DeliveryPartnerZone`, `DeliveryJob`, `DeliveryAssignment`, `DeliveryEvent`, `DeliveryOtp`, `DeliveryCollection`, `DeliveryQrCode`, `DeliveryCashEntry`, `DeliverySettlement`, `DeliveryEarning`, `DeliveryProof`, `DeliveryRating`. Fields are defined in Functional Design.
