# Delivery Module: Units of Work (Phase 1)

Decisions: build order U8.1 to U8.5 (U1=A), one additive migration per unit (U2=A), per-unit design depth as in U3=A.
All units are slices of the same deployable system (API, worker, web). Code lives under the paths in `components.md`.

## U8.1 Delivery core

- **Purpose**: everything needed to create partners, assign an order, and move a job to delivered with an OTP.
- **Scope**
  - `packages/shared/src/delivery`: status machine, mapping to order and tracking status, zod schemas, money helpers (`codDue`, `earningFor`), tracking labels.
  - Prisma + migration 1: `DeliveryPartner`, `DeliveryZone`, `DeliveryZonePincode`, `DeliveryPartnerZone`, `DeliveryJob`, `DeliveryAssignment`, `DeliveryEvent`, `DeliveryOtp`; append-only triggers on events; guard trigger "delivered needs OTP verified".
  - API: `PartnerService`, `ZoneService`, `PartnerAuthService` and guard (`JWT_PARTNER_SECRET`), `JobService`, `JobQueryService`, `OrderSyncService`, `DeliveryOtpService`, `DeliverySettingsService`, admin and partner controllers for these, role guards (D3).
  - `FulfilmentService.createShipment` skips orders with an active job; mock shipment is cancelled on assign.
  - Worker: queue `delivery` with `accept-timeout`, `partner-stale`, `otp-cleanup`; heartbeat row and health check.
  - Completion gates: `complete` verifies the OTP and calls a list of `CompletionGate`s (empty in this unit; U8.2 registers payment and proof gates).
  - Env: `JWT_PARTNER_SECRET`, `DELIVERY_OTP_PEPPER` in `env.schema.ts` and compose files.
- **Requirements covered**: DL-1.1 to DL-1.5, DL-2.1 to DL-2.5, DL-3.1 to DL-3.4, DL-4.1, DL-4.2, DL-6.1 (API side), DL-7.4, DL-8.1 (three jobs), DL-8.2.
- **Done when**: API tests pass for the state machine (property-based), OTP, partner auth and lockout, partner can only see own jobs, assign/reject/timeout flow, order and shipment sync; `tsc`, `eslint`, `jest` clean in shared and api.

## U8.2 Collection, cash and proof

- **Purpose**: money and evidence for a delivery.
- **Scope**
  - Prisma + migration 2: `DeliveryCollection`, `DeliveryQrCode`, `DeliveryCashEntry`, `DeliverySettlement`, `DeliveryEarning`, `DeliveryProof`; append-only triggers on the ledger.
  - API: `CollectionService`, `QrPaymentHandler`, `WebhookEventRouter` and the `qr_code.` branch in `PaymentService.handleWebhook`, `createUpiQr` and `closeQr` on the payment port (Razorpay adapter and mock), `LedgerService`, `SettlementService`, `EarningsService`, `ProofService`, payment and proof completion gates, `qr-expiry` job, partner cash endpoints, admin cash endpoints (super admin).
  - COD `Payment` set to captured when cash or QR is confirmed.
- **Requirements covered**: DL-4.3, DL-4.4, DL-5.1 to DL-5.7, DL-8.1 (`qr-expiry`).
- **Done when**: tests for cash amount check, ledger balance and settlement (property-based), QR webhook idempotency and amount mismatch, late or duplicate payment flagged, proof rule, completion gates; a real Razorpay QR creation attempt reported (works, or "QR Codes not enabled" shown).

## U8.3 Admin screens

- **Purpose**: staff operate the module from the web admin.
- **Scope**: `/admin/delivery` dashboard (counts, attention list), jobs list and detail with timeline and proof, partners list and form, zones, cash overview with settle, adjust and void (super admin), settings form; "Assign delivery" action on the admin order detail with partner suggestions; sidebar entry.
- **Requirements covered**: DL-7.1, assign UI of DL-2.1, partner admin UI of DL-1.1 and DL-1.5.
- **Done when**: `tsc`, `eslint`, component tests clean in web; screens work against the local API.

## U8.4 Partner app (PWA)

- **Purpose**: the delivery person's phone app at `/partner`.
- **Scope**: manifest, service worker (app shell only, no offline status changes), login and change password, jobs list with 15 s polling and new-job alert, job detail with customer name, address, phone and map link, accept and reject, pick up, start route, arrive, fail with reason, OTP entry and resend, proof capture and signature pad, cash entry, UPI QR display with status polling, cash-in-hand view, online switch and heartbeat with optional GPS.
- **Requirements covered**: DL-1.2 and DL-1.4 (UI), DL-2.4 (UI), DL-4 (UI), DL-5 (UI), NFR-D5.
- **Done when**: works at 360 px width, large touch targets, no horizontal scroll; tests for the API client and key components; manual run through of a full delivery against the local API.

## U8.5 Customer side

- **Purpose**: what the customer sees and receives.
- **Scope**: `DeliveryNotifier` and the `notify` queue job (e-mail and in-app only, skip when no e-mail), notification types and templates, `TrackingService` and public `GET /tracking/:token`, rating endpoint, `/t/[token]` page, tracking link in the "assigned" e-mail, partner name and phone in My Orders once picked up, check that new tracking labels show correctly on web and in the Android app, Prisma + migration 3: `DeliveryRating`.
- **Requirements covered**: DL-6.1 (UI check), DL-6.2 to DL-6.5.
- **Done when**: tests for the notifier (never passes a phone), token view hides address and phone, one rating per job; `tsc`, `eslint`, `jest` clean in api, web, mobile.

## Out of Phase 1 (later cycles)

DL-7.2 (reports, CSV, audit viewer, KYC documents, notification log, bulk assign, live map list) and DL-7.3.
