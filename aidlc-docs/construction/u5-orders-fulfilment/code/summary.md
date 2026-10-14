# U5 orders-fulfilment — Code Generation Summary

Connects payment-confirmed orders to fulfilment: order state machine, GST invoices, ShipRocket shipping
with tracking, returns, and refunds. Builds on U1–U4.

## What was built

### Shared (`packages/shared`)
- `orders.ts` — state-machine helpers (`canTransition`, `nextStates`, `canCustomerCancel`),
  `formatInvoiceNumber`, `clampRefund` + `orders.test.ts` (6 property tests).

### Data model (`apps/api/prisma`)
Shipment, TrackingEvent, Invoice (unique per order), InvoiceCounter (sequential numbering), ReturnRequest,
ReturnItem; Order gains `invoiceUrl`/`cancelledReason` and relations.

### Integrations
- `integrations/shipping/` — `ShippingProvider` port + `MockShippingProvider` (deterministic AWB + canned
  tracking) + `ShipRocketProvider` (auth + serviceability + AWB + tracking via resilient HTTP).

### Services (`apps/api/src/modules/orders`)
- `order.service.ts` — validated transitions (shared state machine), customer/admin cancel (release/
  restock + refund), one-tap reorder, ownership-scoped reads (IDOR-safe).
- `invoice.service.ts` — idempotent GST invoice with atomic sequential number, HTML rendered and stored
  via the storage port.
- `fulfilment.service.ts` — AWB creation (→ order packed) and tracking sync (→ advances order state).
- `return.service.ts` — delivered-only return requests; on receipt restock + refund clamped to captured
  amount.
- `orders.worker.ts` — BullMQ consumers on the INVOICES + SHIPMENTS queues for `order.confirmed`
  (invoice generation + shipment creation + tracking sync).

### HTTP
- Controllers: `orders` (customer: list/detail/tracking/invoice/cancel/reorder/returns) and
  `admin/orders` (`@Roles('order_manager')`: list/transition/cancel/shipment/sync/return-update).
- `OrdersModule` wired into `AppModule`; `OrdersWorkerModule` into `WorkerModule`. CartService exported
  from CartCheckoutModule for reorder.

### Web (`apps/web`)
- Order list and order detail pages: item snapshot, price breakup, tracking timeline, invoice download,
  cancel, return/replace, and reorder. Tracking-timeline CSS.

## Verification (executed)
- shared: **35 tests pass**, built. `prisma generate` OK. **API typecheck clean**. **API tests: 45/45
  pass** (adds order transition/cancel + return refund-clamp tests; state-machine PBT in shared).

## Extension compliance (U5)
- **Security**: SECURITY-05 (zod on all endpoints), SECURITY-08 (customer order reads ownership-checked;
  admin order/return/shipment endpoints behind `@Roles`). No blocking findings.
- **Resiliency**: RESILIENCY-10 (ShipRocket via circuit-breaker HTTP client; invoice + shipment work
  runs on BullMQ with retries; idempotent invoice generation). No blocking findings.
- **PBT**: PBT-03/06 — state-machine transition validity + stateful sequences, invoice-number format,
  refund clamp — all passing. No blocking findings.

## Follow-ups
- `refund_wallet` return resolution credits the wallet in U6 (hook in place).
- Real ShipRocket credentials + pickup pincode/config are supplied at deploy (adapter implemented).
- Notification of order events (confirmation, shipped, delivered) is enqueued; U6 NotificationDispatcher
  consumes the NOTIFICATIONS queue.
