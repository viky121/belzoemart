# U5 orders-fulfilment — Domain Entities

Extends the Order created in U4 with fulfilment, invoicing, returns, and refunds. Reuses the Order,
OrderItem, and Payment models from U4.

## Order (extended usage)
- Lifecycle owned here via the state machine (shared `ORDER_TRANSITIONS`):
  pending → confirmed → packed → shipped → out_for_delivery → delivered; plus cancelled and returned.
- New optional fields: `invoiceUrl?`, `cancelledReason?`.

## Shipment
- `Shipment`: `id`, `orderId`, `provider` (`shiprocket`|`mock`), `awb?`, `courier?`, `status`,
  `trackingUrl?`, `labelUrl?`, `manifestUrl?`, `estimatedDelivery?`, `createdAt`, `updatedAt`.
- `TrackingEvent`: `id`, `shipmentId`, `status`, `description`, `location?`, `occurredAt`.

## Invoice
- `Invoice`: `id`, `orderId` (unique), `number` (unique, GST invoice series), `url`, `createdAt`.
- GST invoice content: seller GSTIN, HSN per item, place of supply, CGST/SGST/IGST split (from the
  Order snapshot).

## Return
- `ReturnRequest`: `id`, `orderId`, `customerId`, `status` (`requested`|`approved`|`picked`|`received`|
  `refunded`|`rejected`), `reason`, `imagesJson`, `pickupScheduledAt?`, `resolution`
  (`refund_source`|`refund_wallet`|`replace`), `createdAt`, `updatedAt`.
- `ReturnItem`: `id`, `returnRequestId`, `orderItemId`, `quantity`.

## Refund
- Reuses U4 Payment + PaymentService.refund; refund status tracked on Payment
  (`refunded`|`partially_refunded`).

## Enums / constants
- Order status + transitions live in shared `constants.ts` (ORDER_STATUSES, ORDER_TRANSITIONS) — reused
  as the single source of truth for the state machine.
