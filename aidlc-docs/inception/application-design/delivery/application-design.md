# Application Design: Delivery Module (consolidated)

Detail files in this folder: `components.md`, `component-methods.md`, `services.md`, `component-dependency.md`.
Requirements: `aidlc-docs/inception/requirements/delivery-module-requirements.md`. Plan and answers: `aidlc-docs/inception/plans/application-design-plan-delivery.md`.

## Summary

- One NestJS `DeliveryModule` (`apps/api/src/modules/delivery`) with 12 internal components, plus shared code in `packages/shared/src/delivery`, admin screens, a partner PWA at `/partner`, and a public page `/t/[token]`.
- A delivery job points at the existing `Order` and owns an `inhouse` `Shipment`. Every status change writes a `TrackingEvent`, so My Orders (web and Android) shows the delivery without new customer code.
- Only `JobService` changes job status, in one transaction, using a pure state machine from `packages/shared`.
- Partners log in with mobile and password in their own realm (separate secret `JWT_PARTNER_SECRET`, own guard, own refresh cookie). A partner can only read jobs assigned to them.
- Delivery OTP: peppered hash, SMS purpose `delivery`; delivered is impossible without it.
- COD: cash with exact amount, or a single-use fixed-amount Razorpay UPI QR. Razorpay confirms by webhook (`qr_code.credited`), routed through a small registry so checkout does not import delivery. UPI money is not counted as cash in hand.
- Customer messages (assigned, cancelled, delivered, failed): e-mail and in-app only, never a phone number passed, so no SMS.
- Admin access: `order_manager` and `super_admin` for jobs, assign, partners, zones; `super_admin` only for cash, settlements, earnings and settings.
- Background work: BullMQ repeatable jobs on a new `delivery` queue in the existing worker.
- Small changes to existing code: skip mock shipment when a job exists, `qr_code.*` branch in the webhook, QR methods on the payment port, tracking labels, queue and notification types, two env vars.

## Decisions (from the plan answers, all A)

| Id | Decision |
|---|---|
| D1 | One module with folders per concern |
| D2 | Job owns an `inhouse` Shipment and tracking events |
| D3 | `order_manager` + `super_admin` for operations; `super_admin` only for cash and settings |
| D4 | Separate `JWT_PARTNER_SECRET`, own guard and cookie |
| D5 | BullMQ repeatable jobs in the worker |
| D6 | Rejected or unanswered jobs return to `new` with a badge and audit entry; no extra notification system |
| D7 | Partner app polls every 15 s; no web push in Phase 1 |
| D8 | Proof files in the existing storage, unguessable names, real file-type checks; signed URLs later |
| D9 | Assign works for `confirmed` and `packed` orders only |

## Open points carried into Functional Design

1. What happens to the Order when a job ends `returned` (undeliverable): the order state machine has no path from `out_for_delivery` to `returned` or `cancelled`. Needs a transition, stock restock, and refund for prepaid orders.
2. COD orders: invoice generation and the "confirmed" notification are not triggered by the manual admin confirm today; check whether COD delivery needs an invoice on delivery.
3. Exact schema, OTP numbers, lockout numbers, rounding, geofence rule, proof rule, earnings rule.
4. Razorpay QR Codes must be enabled on the account; to be checked with the real keys. The webhook must also subscribe to `qr_code.credited`.

## Extension compliance (design level)

| Extension | Status | Notes |
|---|---|---|
| Security Baseline | Compliant at design level | separate auth realm and secret, object-level access per partner, hashed OTP with pepper, lockouts, rate limits, webhook signature check, append-only tables, input validation by zod, audit entries. Detailed in NFR Design |
| Resiliency Baseline | Compliant at design level | resilient HTTP client for Razorpay and SMS, idempotent webhook and jobs, queue retries, worker heartbeat, graceful degradation (cash fallback, OTP resend). Detailed in NFR Design |
| Property-Based Testing | Planned | state machine, ledger balance, money rounding, OTP rules get property tests in Code Generation |
