# U5 orders-fulfilment — Business Rules & Testable Properties

## Order state machine
- BR-1 Transitions must follow shared `ORDER_TRANSITIONS`. Any other transition is rejected. (pending→
  confirmed→packed→shipped→out_for_delivery→delivered; cancelled/returned are terminal-ish.)
- BR-2 Customer can cancel only while `pending`/`confirmed` (before packed). Admin can cancel up to
  `shipped` per policy.
- BR-3 Cancelling releases any stock still reserved and triggers a refund if payment was captured.

## Invoicing
- BR-4 A GST invoice is generated on `confirmed` (async). Invoice number is unique and sequential
  (series `BELZO/YYYY/NNNNN`). It records GSTIN, per-item HSN, place of supply, and CGST/SGST/IGST from
  the order snapshot.
- BR-5 Invoice generation is idempotent per order (one invoice per order).

## Fulfilment
- BR-6 On `confirmed`, a shipment is created via the ShippingProvider port (AWB assigned), moving the
  order to `packed`. Tracking updates advance the order (shipped → out_for_delivery → delivered).
- BR-7 Serviceability/ETA/shipping cost come from the provider by PIN + weight (used at PDP/checkout).
- BR-8 RTO (return-to-origin) marks the shipment returned and releases/ō restocks inventory.

## Returns & refunds
- BR-9 A return can be requested only for `delivered` orders within the return window; requires reason
  (+ optional images).
- BR-10 On return `received`, restock inventory and initiate the refund to source or wallet per
  resolution. Refund amount ≤ captured amount.
- BR-11 Refund uses U4 PaymentService.refund (provider) for source refunds; wallet refunds credit the
  U6 wallet (deferred hook until U6).

## Testable Properties (PBT-01)

| Property | Category | Rule |
|---|---|---|
| canTransition(from,to) true iff to ∈ ORDER_TRANSITIONS[from] | Invariant (PBT-03) | BR-1 |
| any sequence of valid transitions never reaches an undefined state | Stateful (PBT-06) | BR-1 |
| invoice number format matches BELZO/YYYY/NNNNN and is unique across a sequence | Invariant (PBT-03) | BR-4 |
| refund amount is clamped to ≤ captured amount | Invariant (PBT-03) | BR-10 |
| cancel allowed ⇔ status ∈ {pending,confirmed} (customer) | Invariant (PBT-03) | BR-2 |

Components with no PBT: ShipRocket adapter I/O and PDF rendering (integration-tested via mock).
