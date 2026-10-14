# U5 orders-fulfilment — Code Generation Plan

Workspace root: `c:\xampp\htdocs\Belzo`. Adds order lifecycle, invoices, shipping, returns, and refunds
to `apps/api`; order list/detail/track/return pages to `apps/web`. Depends on U1–U4.

## Unit Context
- **Requirements**: FR-5 (orders, tracking, invoice, cancel, returns, refund, reorder), FR-9.2-9.6
  (admin order/fulfilment backend), NFR-2.1 (GST invoice).
- **Business rules**: `construction/u5-orders-fulfilment/functional-design/business-rules.md`.
- **Depends on**: U4 (Order/Payment/PaymentService), U3 (InventoryService), U2 (auth).

## Steps

- [ ] Step 1 — Shared: order state-machine helpers in `packages/shared` (`orders.ts`: canTransition,
  nextStates, invoiceNumber format helper) + PBT (`orders.test.ts`).
- [ ] Step 2 — Prisma models: Shipment, TrackingEvent, Invoice, ReturnRequest, ReturnItem (+ enums);
  add `invoiceUrl`/`cancelledReason` to Order. Migration.
- [ ] Step 3 — Shipping port: `ShippingProvider` (serviceability/createAwb/getTracking) +
  `MockShippingProvider` + `ShipRocketProvider` (auth + AWB via resilient HTTP), env-selected.
- [ ] Step 4 — OrderService: get (ownership), listForUser, adminList, transition (validated state
  machine), cancel (customer/admin rules + release stock + refund), reorder (rebuild cart). Unit tests
  + PBT (transition validity).
- [ ] Step 5 — InvoiceService: generate GST invoice (idempotent, sequential number, stores via storage
  port; simple HTML/PDF-ready payload) + worker processor for `order.confirmed`.
- [ ] Step 6 — FulfilmentService: createShipment (AWB via port → order packed), syncTracking (advance
  order), serviceability; worker processor for `order.confirmed` shipment creation + tracking sync.
- [ ] Step 7 — ReturnService + RefundService: request/approve/schedulePickup/receive; refund via U4
  PaymentService (source) with amount clamp.
- [ ] Step 8 — Controllers: customer (`orders` list/detail/track/invoice/cancel/reorder, `returns`
  create/status) + admin (`admin/orders` list/detail/transition, `admin/shipments`, `admin/returns`).
- [ ] Step 9 — OrdersModule + OrdersWorkerModule (invoice + shipment + notification-hook processors) +
  wiring into AppModule and WorkerModule.
- [ ] Step 10 — Web: order list, order detail with tracking timeline + invoice download, cancel/return
  flows, one-tap reorder.
- [ ] Step 11 — Tests: state-machine PBT (shared), OrderService transition/cancel units, refund clamp,
  invoice-number format.
- [ ] Step 12 — Docs: `construction/u5-orders-fulfilment/code/summary.md`. Verify (build shared, prisma
  generate, tsc, jest).

## Testable Properties carried into code (PBT-01 → PBT-03/06)
- canTransition matches ORDER_TRANSITIONS; valid-transition sequences never reach undefined state.
- invoice number format + uniqueness; refund amount clamp; cancel-allowed predicate.

## Traceability
FR-5.1/5.2 → 4/6/8/10; FR-5.3 (invoice) → 5/8/10; FR-5.4 (cancel) → 4/8/10; FR-5.5/5.6 (returns/refund)
→ 7/8/10; FR-5.7 (reorder) → 4/10; FR-9.* (admin) → 4/6/8; NFR-2.1 → 5.
