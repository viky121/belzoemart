# Self Pickup at Checkout: Build Summary (2026-10-31)

Requirements: `aidlc-docs/inception/requirements/self-pickup-requirements.md` (answers Q1-Q8 and the clarification round).
Status: built and tested. **Not deployed. No APK built.** Deploy needs the migration `20261031120000_order_self_pickup` (adds one enum and three columns; nothing existing changes). The app part needs a new APK.

## What the customer sees
- **Checkout (website and Android app):** a new "Delivery Method" choice: Home delivery (as before) or Self pickup.
  - Self pickup shows the shop name, address and phone (from Settings > Store) and the shop's pickup note, then a choice of day (today and the next 2 days) and one time slot. A time is required to place the order.
  - The customer still picks a saved address (it stays on the order for the bill). The PIN code check is skipped, in the checkout and in the "add address" form, **only while Self pickup is chosen**. Home delivery keeps the check.
  - Delivery charge Rs. 0 and no COD fee. GST is split as CGST + SGST.
  - The cash choice reads "Pay at shop on pickup" (cash or UPI at the counter). Online payment works as before.
  - Pickup is optional: nothing changes for home delivery. If the shop switches pickup off, the choice disappears.
- **Order page (website and app):** "Self pickup" block with shop address, timings note and the chosen time. Steps: Order placed, Confirmed, Ready for pickup, Picked up. No shipment/tracking box.
- **Customer gets told** (notification + email) when the shop presses "Ready for pickup". The confirmation email shows the pickup time instead of a delivery address.
- **Invoice:** "Delivery: Self pickup", "Pickup time", no delivery charge line, payment "Pay at shop on pickup", "To Pay at Shop", place of supply = the shop's state. The UPI payment QR code (added earlier) still prints for the amount to pay.

## What the shop sees (admin)
- **Settings > Self pickup:** on/off switch (default on), opening time, closing time, slot length (15 to 120 minutes), note. Default hours 10:00 to 20:00, 60-minute slots. Wrong values fall back to the defaults.
- **Orders list:** a "Pickup" tag with the pickup time. Buttons: **Ready for pickup** (Packed step) and **Picked up** (Delivered step). No "Create shipment".
- **Order detail:** a "Self pickup" card with the same button and a hint of what to do next.
- **Picked up** also marks the cash/UPI paid at the shop as received (payment becomes captured, method `pay_at_shop`).
- A pickup order cannot be given to a delivery partner and cannot get a shipment (the system refuses both and says why).

## How it works (for review)
- Database: `orders.fulfilment` (`delivery` default | `pickup`), `orders.pickupSlotStart`, `orders.pickupSlotEnd`.
- Slots are computed on the server in India time (`packages/shared/src/pickup.ts`). The apps only show what `GET /api/v1/checkout/pickup` returns; the server checks the chosen slot again when the order is placed (must be offered now, at least 2 hours ahead, within 3 days, on the shop's slot grid).
- Checkout: `POST /checkout/preview` and `/checkout/place` take optional `fulfilment` and `pickupSlotStart`. Old apps do not send them and keep working as home delivery.
- No new order status: pickup uses Packed ("Ready for pickup") and Delivered ("Picked up"); the transition table allows Packed to Delivered for pickup orders only.
- Settings keys: `pickup.enabled`, `pickup.openTime`, `pickup.closeTime`, `pickup.slotMinutes`, `pickup.note`.

## Verified
- Shared 538 tests, API 1164 tests (plus 6 real-database tests that run only with a database URL), web 418 tests, app 335 tests; tsc clean in all four; eslint 0 errors (web: the 4 old warnings); web production build (`next build`) passes.
- Real PostgreSQL run (scratch database, all 17 migrations, schema drift empty): placed a pickup order for a customer in another state at a PIN we do not deliver to; checked the saved row, slot, stock reservation, the customer's order list/detail fields, Confirmed to Ready for pickup to Picked up, the payment marked received, shipped refused, bad slot refused with nothing written. Test: `apps/api/src/modules/checkout/checkout.pickup.db.spec.ts` (runs only with `PICKUP_DB_TEST_URL`).
- The Android checkout screen was tested end to end in the real screen (choose pickup, see shop and slots, time required, place order with the right request body).

## Things to know / not done
- Assumption: the admin flow is the recommended one (Ready for pickup / Picked up, no Create shipment). The user did not answer that clarification question; easy to change.
- Not built (out of scope): pickup code, limit of orders per slot, returns of a pickup order (the existing return flow, which collects from the customer's address, is unchanged), pickup for guests.
- After deploy: fill Settings > Store address (it is the pickup address) and Settings > Self pickup (note, hours). Old pending COD orders and old invoices are unaffected.
- Admin app of the delivery partners is not affected.
