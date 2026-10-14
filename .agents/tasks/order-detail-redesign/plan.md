# Implementation Plan: customer order-detail redesign, live status, cancel/return flows

Work directly on `master` in `c:\xampp\htdocs\Belzo`. Never deploy, never push. Stage only the files you touch (`.env`, `Belzo-key.pem`, untracked `.agents/` files must never be staged).

Machine-readable versions of this plan: `context.json`, `features/FEAT-001.json` (shared + API), `features/FEAT-002.json` (web). Same content, more detail per step.

## Findings that drive the design

- Page today (`apps/web/src/app/(shop)/orders/[id]/page.tsx`): bare list, raw `order.status`, hard-coded cancel reason `'Changed my mind'`, return reason `'Not as expected'`, three identical `.btn` buttons, tracking prints `s.status` and raw `e.status`.
- Where the stale `packed` comes from:
  - `FulfilmentService.createShipment` writes `Shipment.status = 'packed'` once, and `syncTracking` never updates it.
  - `MockShippingProvider.getTracking` returns a fixed `[packed, shipped, out_for_delivery]` list with times relative to `now`, whatever the order's state.
  - `syncTracking` runs once from `OrdersWorker` on `order.confirmed`. It stores those events (and duplicates them on every re-sync). It then tries a single `packed → out_for_delivery` hop, which is illegal, so nothing moves.
  - The admin then sets the order to `delivered` (`PATCH /admin/orders/:id/status`). The result: the order says `delivered`, the shipment says `packed`, and the events stop at `out_for_delivery`.
- No status history exists. `Order` has only `createdAt`/`updatedAt`, `OrderStatus` has no `refunded`, and `ShipmentStatus` is `created|packed|shipped|out_for_delivery|delivered|rto`. There is no return window anywhere in the code, so no window is invented. Return rules today: delivered-only plus `product.isReturnable`. `items` is not validated (the controller zod also drops `items`), and there is no duplicate-return or quantity check.
- `getForCustomer` returns no address. `Order.addressId` has no relation, so it needs a separate lookup. It also returns no returns, no `isReturnable` and no variant attributes.
- Storage URLs can be relative. With `PUBLIC_BASE_URL` unset, local `getUrl` gives `/api/uploads/<key>`, so return images must not use `z.string().url()`. Instead they are validated against `storage.getUrl('returns/')`.
- `formatInr` uses `minimumFractionDigits: 0`, which is why the page shows "₹479.4".
- Build quirk: the API `tsc` reads `@belzo/shared` from `packages/shared/dist`. Run `pnpm --filter @belzo/shared build` after any shared change, before API typecheck/lint. Jest (API/web) and Next read `src` directly.
- Web jest runs in the `node` environment with `*.test.ts` only, so only pure helpers in `src/lib` can be tested.

## Design decisions

1. **Order status is the single source of truth, and reconciliation happens on read.** A shared pure function `reconcileTracking` computes each shipment's status and the overall latest status as `furthestStatus(order.status, shipment/event statuses)`. Terminal order statuses (cancelled/returned) always win. When the events lag the order, it adds derived milestones on top, marked `derived: true`. The time shown is real or nothing: `shipment.createdAt` for packed, `order.updatedAt` only for the current status (and only if it is newer than the last real event), otherwise `null`. Because this runs on read, the owner's existing order a614d761 is fixed without a data migration.
2. **The mock provider follows the order.** The port gets an optional `ctx {orderStatus, since}`. The mock emits steps up to the order's status, at `since + i·30min`, clamped to now. `syncTracking` dedupes, updates `shipment.status`, and walks legal transitions. The state-machine rules themselves do not change.
3. **Reason catalogues live in shared** (`returns.ts`) so the web UI and the API use one photo-required rule. The DTO gets an optional `reasonCode`. The server applies the stricter of the code and the reason-text prefix, so free-text clients can't skip photos by leaving out the code.
4. **Dedicated return-photo endpoint** `POST /orders/returns/media/upload`. It shares the validation helper extracted from the review upload. Files go under `returns/<uuid>.<ext>`, and the server accepts only URLs of exactly that shape under its own storage prefix.
5. **Web logic goes into pure helpers** (`lib/order-view.ts`) so it can be unit tested. The page is split into `order-sections.tsx`, `order-dialog.tsx`, `cancel-order-modal.tsx` and `return-request-modal.tsx` in the route folder.
6. **Actions have one primary button.** Reorder is primary. Invoice and Return/Replace are outline buttons, Cancel is an outline danger button, and Need help is a link.
7. **Resolution options:** "Refund to original payment" is offered only for prepaid orders where a payment was captured, because COD `refund_source` refunds nothing in `ReturnService.processReceived`. "Refund to wallet" is always offered. "Replace" is offered only for defect, quality or size reasons.
8. **`formatInr`** shows 2 decimals only when an amount has paise (₹10,067.40), and keeps whole amounts as they are (₹9,588). This is a display change only.

## Steps

- [ ] 1. **Shared tracking helpers.** Create `packages/shared/src/order-tracking.ts` and export it from `index.ts`. It contains `ORDER_PROGRESS_STEPS`, `ORDER_STATUS_LABELS` plus extra tracking labels, `normalizeStatus`, `statusLabel` (falls back to a humanized form), `TRACKING_PROGRESS_MAP`, `progressRank`, `isTerminalOrderStatus`, `furthestStatus` and `reconcileTracking`, with the types and rules in FEAT-001 steps 1–2. Add tests in `packages/shared/src/order-tracking.test.ts`.
      Files: packages/shared/src/order-tracking.ts, packages/shared/src/order-tracking.test.ts, packages/shared/src/index.ts
      Verify: `pnpm --filter @belzo/shared test` passes, including the case where the order is delivered and the shipment is packed with events up to out_for_delivery, which must give latest = delivered plus a derived delivered event first.

- [ ] 2. **Shared reason catalogues.** Create `packages/shared/src/returns.ts` and export it. It contains `RETURN_REASON_CODES`/`RETURN_REASONS` (label, photoRequired, allowReplace, commentRequired), `CANCEL_REASON_CODES`/`CANCEL_REASONS`, `MAX_RETURN_IMAGES=6`, `REASON_MAX_CHARS=300`, `OTHER_REASON_MIN_CHARS=10`, `findReturnReason`, `returnReasonRequiresPhotos` (the stricter of code and text prefix) and `composeReason` (`"<label>: <comments>"`, capped at 300). Add tests.
      Files: packages/shared/src/returns.ts, packages/shared/src/returns.test.ts, packages/shared/src/index.ts
      Verify: `pnpm --filter @belzo/shared test` passes, then run `pnpm --filter @belzo/shared build`.

- [ ] 3. **Mock shipping follows the order.** Add `TrackingContext {orderStatus?, since?}` and change the port to `getTracking(awb, ctx?)`. Rewrite `MockShippingProvider.getTracking` to emit packed → shipped → out_for_delivery → delivered up to `progressRank(ctx.orderStatus)`. With no context, or for cancelled/pending/confirmed, it emits packed only; returned emits through delivered. Event times are `since + i·30min`, clamped to now. Add a spec. (Depends on 1.)
      Files: apps/api/src/integrations/shipping/shipping.provider.ts, apps/api/src/integrations/shipping/mock-shipping.provider.ts, apps/api/src/integrations/shipping/mock-shipping.provider.spec.ts
      Verify: `pnpm --filter @belzo/api test -- mock-shipping` passes, and `pnpm --filter @belzo/api typecheck` passes (Shiprocket's 1-arg implementation stays valid).

- [ ] 4. **Fix `syncTracking`.** Load the order first and pass `{orderStatus, since: shipment.createdAt}` to the provider. Skip events whose `status|description|location` is already stored. Set `shipment.status` to the furthest forward ShipmentStatus. Advance the order by walking legal `canTransition` hops up to the furthest of shipped/out_for_delivery/delivered, using a single update. Extend the spec. (Depends on 1, 3.)
      Files: apps/api/src/modules/orders/fulfilment.service.ts, apps/api/src/modules/orders/fulfilment.service.spec.ts
      Verify: `pnpm --filter @belzo/api test -- fulfilment` passes: provider receives ctx, no duplicate events, packed → out_for_delivery via shipped, cancelled order not moved, and the existing weight tests still pass.

- [ ] 5. **Richer, reconciled order detail.** In `OrderService.getForCustomer`:
      - Include `returns` (with items, newest first).
      - Add the owned `address` (or null).
      - Add `items[].isReturnable` (default true when the variant is gone) and `items[].attributes`.
      - Map `returns[]` to `{id,status,reason,resolution,images,items,createdAt,updatedAt}`.
      - Add `tracking = reconcileTracking(...)` and overwrite each `shipments[i].status` with its reconciled value.

      Point `GET /orders/:id/tracking` at `getForCustomer(...).tracking`. Update `order.service.spec.ts`: add an address stub and `shipments/returns` to the fixture, plus a new reconciliation and fields test. (Depends on 1.)
      Files: apps/api/src/modules/orders/order.service.ts, apps/api/src/modules/orders/orders.controller.ts, apps/api/src/modules/orders/order.service.spec.ts
      Verify: `pnpm --filter @belzo/api test -- order.service` passes, including the new test where a delivered order has a shipment that is packed with events up to out_for_delivery, which must give `tracking.latestStatus === 'delivered'` and `shipments[0].status === 'delivered'`.

- [ ] 6. **Return-photo upload endpoint.** Move the review upload validation into `apps/api/src/modules/media/customer-image-upload.ts` (`storeCustomerImage(storage, file, folder)`, same 15 MB limit, same mimetypes, same messages) and make `ReviewMediaController` use it. Add `ReturnMediaController` (`@Controller('orders/returns/media')`, `@Post('upload')`, folder `returns`), register it in `MediaModule`, and add a spec. Create `apps/api/src/modules/orders/return-images.ts` (`RETURN_MEDIA_FOLDER`, `isOwnReturnImageUrl(url, prefix)` with a uuid.ext regex).
      Files: apps/api/src/modules/media/customer-image-upload.ts, apps/api/src/modules/media/review-media.controller.ts, apps/api/src/modules/media/return-media.controller.ts, apps/api/src/modules/media/return-media.controller.spec.ts, apps/api/src/modules/media/media.module.ts, apps/api/src/modules/orders/return-images.ts
      Verify: `pnpm --filter @belzo/api test -- media` passes: non-image is rejected, the file is stored as `returns/<uuid>.<ext>`, and the returned URL passes `isOwnReturnImageUrl`.

- [ ] 7. **Server-side return validation.**
      - Controller zod: `images` becomes non-`.url()` strings (max 6), and add the optional `reasonCode` enum and `items[{orderItemId uuid, quantity int 1..1000}]` (1..100).
      - Inject `STORAGE_PROVIDER` as the 5th `ReturnService` dependency.
      - Validate items: no duplicates, each item belongs to the order, and quantity ≤ ordered minus what is already in non-rejected returns.
      - Keep the non-returnable check.
      - Photos: required (400) when `returnReasonRequiresPhotos`.
      - Every image must pass `isOwnReturnImageUrl(url, storage.getUrl('returns/'))`, otherwise return 400.
      - Store unique images.

      Extend `return.service.spec.ts` (with a storage stub in both existing constructors). (Depends on 2, 6.)
      Files: apps/api/src/modules/orders/orders.controller.ts, apps/api/src/modules/orders/return.service.ts, apps/api/src/modules/orders/return.service.spec.ts
      Verify: the full API set passes: `pnpm --filter @belzo/shared build && pnpm --filter @belzo/api typecheck && pnpm --filter @belzo/api lint && pnpm --filter @belzo/api test`. The new cases are: missing photos rejected for Damaged (both by code and by text), accepted with 1 own URL, foreign host and reviews/ URLs rejected, "No longer needed" with no photos accepted, and foreign item and over-quantity rejected. Then commit the shared and API changes (2 commits, per FEAT-001 step 11).

- [ ] 8. **Web money + upload helpers.** In `formatInr`, use 2 decimals when `paise % 100 !== 0`, and add `format-inr.test.ts`. Refactor `customer-upload.ts` into a private `uploadCustomerImage` with `uploadReviewImage` (unchanged) and `uploadReturnImage` (`/orders/returns/media/upload`) wrappers.
      Files: apps/web/src/lib/catalogue-api.ts, apps/web/src/lib/format-inr.test.ts, apps/web/src/lib/customer-upload.ts
      Verify: `pnpm --filter @belzo/web test` passes; `pnpm --filter @belzo/web typecheck` passes.

- [ ] 9. **Web pure view helpers.** Create `apps/web/src/lib/order-view.ts` with the `OrderDetail` type and these helpers: `shortOrderId`, `statusBadge`, `isLiveStatus`, `buildStepper`, `paymentSummary`, `refundNote`, `cancelEligibility`, `cancelReasonError`, `cancelReasonText`, `returnEligibility`, `photosRequired`, `resolutionOptions`, `ReturnDraft`, `returnStepError`, `buildReturnPayload`, `returnStatusLabel`, `resolutionLabel` and `variantText`. FEAT-002 step 3 has the exact rules. Add `order-view.test.ts` with the cases in FEAT-002 step 4. (Depends on 1, 2.)
      Files: apps/web/src/lib/order-view.ts, apps/web/src/lib/order-view.test.ts
      Verify: `pnpm --filter @belzo/web test` passes.

- [ ] 10. **Dialog + Cancel modal + Return modal.**
      - `order-dialog.tsx`: role=dialog, aria-modal, aria-labelledby, Esc and overlay close unless busy, focus in on open and restore on close, scroll lock.
      - `cancel-order-modal.tsx`: reason radios, comments (Other needs ≥10 chars), refund note, confirm step, then POST `/orders/:id/cancel` with `cancelReasonText`; inline error; `onDone`.
      - `return-request-modal.tsx`: 5 steps (items/qty → reason → resolution → photos via `uploadReturnImage` with thumbnails and remove, plus comments → review). It blocks with `returnStepError`, disables while uploading/submitting, POSTs `/orders/returns` with `buildReturnPayload`, shows the inline server error, and calls `onDone`.

      (Depends on 8, 9.)
      Files: apps/web/src/app/(shop)/orders/[id]/order-dialog.tsx, apps/web/src/app/(shop)/orders/[id]/cancel-order-modal.tsx, apps/web/src/app/(shop)/orders/[id]/return-request-modal.tsx
      Verify: `pnpm --filter @belzo/web typecheck` passes.

- [ ] 11. **Sections + page rewrite + list + CSS.**
      - `order-sections.tsx` holds OrderHeader, OrderStepper, OrderItems, PriceDetails, DeliveryAddress, TrackingCard and ReturnRequestCard, per FEAT-002 step 8.
      - Rewrite `page.tsx` per FEAT-002 step 9:
        - Live refresh on focus/visibility, plus a 30 s poll while `isLiveStatus`.
        - Two-column grid.
        - Action hierarchy: Reorder primary; invoice/return outline; cancel outline-danger; Need help link to `/page/contact`.
        - Ineligible-return reason text.
        - Keep all existing `data-testid`s: order-detail, order-status, order-msg, order-gst-included, order-tracking, order-invoice, order-cancel, order-return, order-reorder.
      - Orders list: human badge label + tone, and no fabricated "Delivered on placed+3d" / "Expected delivery" dates.
      - `globals.css`: `.ord-badge--muted`, `.btn--outline`, `.btn--danger`, `.btn--sm`, and the `.od*` / `.od-modal*` blocks (responsive at 860/720px, `:focus-visible`, `--muted-2` for small text, reduced motion).

      (Depends on 10.)
      Files: apps/web/src/app/(shop)/orders/[id]/order-sections.tsx, apps/web/src/app/(shop)/orders/[id]/page.tsx, apps/web/src/app/(shop)/orders/page.tsx, apps/web/src/app/globals.css
      Verify: `pnpm --filter @belzo/shared build && pnpm --filter @belzo/web typecheck && pnpm --filter @belzo/web test && pnpm --filter @belzo/web build` all pass. Commit `feat(web): redesigned order detail with live status, cancel and return flows`.

- [x] 12. **Full verification + review.** From the repo root run: `pnpm --filter @belzo/shared test`; `pnpm --filter @belzo/shared build`; `pnpm --filter @belzo/api typecheck && pnpm --filter @belzo/api lint && pnpm --filter @belzo/api test`; `pnpm --filter @belzo/web typecheck && pnpm --filter @belzo/web test && pnpm --filter @belzo/web build`. Then run a code review of the whole diff. It should check four things: ownership is still enforced on every customer route; there are no changes to schema, pricing, invoices or ORDER_TRANSITIONS; the photo/URL rules hold server-side; and the UI is accessible.
      Verify: all commands exit 0, `git status` shows only intended files committed, and nothing is pushed or deployed.

## Known gaps / assumptions

- No return window exists, so none is added; ineligibility reasons cover status, non-returnable items and already-requested quantity. Adding a window would be a business-rule change for the owner to decide.
- Concurrent duplicate return requests are not serialized (no transaction). The quantity check covers the normal case.
- The "Confirmed" step date uses `invoice.createdAt`, because the invoice is generated on confirmation. If there is no invoice, no date is shown.
