# Self Pickup at Checkout: Requirements (2026-10-31)

Source: the user's request, answers Q1-Q8 and the clarification round (`self-pickup-questions.md`, `self-pickup-clarification-questions.md`).

## Intent
A customer can choose "Self pickup" at checkout instead of home delivery. The shop address is shown. The customer picks a pickup day and time slot, and pays either at the shop (Cash on Delivery inside the system) or online first. It is optional: home delivery stays the normal choice and works exactly as today.

## Decisions
| # | Decision | Source |
|---|---|---|
| D1 | Website and Android app, both | Q1 = A |
| D2 | Checkout shows the shop address (Admin Settings > Store: name, address, city, state, PIN, phone) and a pickup timings / note text (new Admin Settings box) | Q2 = A |
| D3 | The customer still picks a saved address (it stays on the order as contact and billing address). The PIN code check is NOT applied when Self pickup is chosen, and ONLY then; home delivery keeps the PIN check. Adding a new address while Self pickup is chosen is also not blocked by the PIN check | Clarification Q1 = B, "only in the self pickup case" |
| D4 | Pickup order: delivery charge Rs. 0 and no COD fee | Q4 = yes |
| D5 | The cash choice is called "Pay at shop on pickup" only when Self pickup is chosen. With home delivery it stays "Cash on Delivery". Online payment is "Pay online" in both | Q5 |
| D6 | Admin order flow for pickup (assumption: recommended option A, the user did not answer clarification Q2): a "Pickup" tag with the slot on the order, no "Create shipment" and no delivery partner job, buttons "Ready for pickup" (Packed step) and "Picked up" (Delivered step). Pressing "Picked up" on a pay-at-shop order marks the payment as received. No new order status in the database | Clarification Q2 (assumed A) |
| D7 | No pickup code. When staff press "Ready for pickup" the customer gets the usual notification. The order page and the invoice show "Self pickup", the shop address, timings and the chosen slot | Q7, Clarification Q3 = A |
| D8 | Time slot: the shop sets opening time, closing time and slot length in Admin Settings (default 10:00 to 20:00, 60 minutes). The customer picks a day (today and the next 2 days) and one slot. For today only slots that start at least 2 hours from now are shown. The slot is required for pickup. No limit of orders per slot | Clarification Q4 = A |
| D9 | One on/off switch "Self pickup" in Admin Settings (default on). When off, the checkout does not show the choice and the server refuses pickup orders | Q8 |

## Design notes (mine, to be checked in review)
- The order remembers `fulfilment` (`delivery` or `pickup`, default `delivery`) and the slot start and end. One migration that only adds columns and an enum.
- All times are India time (Asia/Kolkata, UTC+5:30). The server builds the list of offered slots; the apps only show it. The server checks the chosen slot again when the order is placed.
- GST for a pickup order is split as CGST + SGST (the goods are handed over in the shop's own state). Home delivery keeps the buyer-state rule.
- An old app without this feature does not send `fulfilment`, so it keeps working as home delivery.
- Out of scope: pickup code, slot capacity limit, returns of a pickup order (the existing return flow is unchanged), pickup for guests (checkout needs a login already).
