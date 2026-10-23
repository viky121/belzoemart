# Functional Design Plan: U8.1 Delivery Core

Inputs: `unit-of-work.md` (U8.1), requirements DL-1 to DL-4 and DL-6.1, application design, and the PHP module's own defaults (its documentation, sections 6.4 and 8.4).

## Plan (checklist)

- [x] Read the unit scope and the PHP rules (status flow, OTP rules, default numbers)
- [x] Answer the questions below (all A)
- [x] Generate `aidlc-docs/construction/u8-1-delivery-core/functional-design/domain-entities.md`
- [x] Generate `.../business-rules.md`
- [x] Generate `.../business-logic-model.md`
- [x] Check the design against DL-1 to DL-4, DL-6.1, DL-7.4, DL-8 and the three extensions
- [x] Present for approval

No `frontend-components.md` for this unit (no screens; screens are in U8.3 and U8.4).

## Decisions I made from the PHP module and the code (tell me if you disagree)

1. **Statuses and moves**: the 10 statuses and 15 moves of the PHP module, unchanged. `delivered`, `returned` and `cancelled` are final.
2. **OTP is sent when the partner starts the route** (not at assignment). A failed attempt followed by a retry sends a new OTP. A delivery needs an OTP that was verified in the current attempt and is not older than 30 minutes at the moment of delivering.
3. **OTP limits (PHP defaults)**: 5 wrong guesses lock the job for 15 minutes, resend cooldown 60 seconds, at most 5 sends per attempt. An admin can clear the lock (audited). The code is never returned by any API and never logged.
4. **Reasons for a failed attempt**: `customer_unavailable`, `wrong_address`, `refused`, `phone_unreachable`, `reschedule_requested`, `cash_unavailable`, `other` (note required for `other`).
5. **Reject**: needs a reason. Reject or no reply within 15 minutes returns the job to `new` with a "Rejected" or "No reply" flag.
6. **Reassign**: allowed until the parcel is picked up. After pick-up the admin can only cancel or wait for a failed attempt.
7. **Cancel** by admin is allowed from any non-final status, with a reason.
8. **Partner limits**: at most 10 active jobs per partner (editable per partner). A partner must be active, and online is not required for an admin to assign.
9. **Partner password**: the admin types the first password; the partner is forced to change it at first login; at least 8 characters. Login lockout: 5 wrong passwords in 15 minutes.
10. **Tracking token**: random 32 bytes, valid 30 days after the job ends.
11. **Geofence is dropped**: Belzo addresses have no map coordinates, so "arrived far from the address" cannot be computed. The partner's GPS is stored with each event for the record. (This replaces the geofence part of DL-4.4.)
12. **Map link** on the partner screen opens Google Maps with the address text, so no map key is needed.

## Questions

Fill the letter after each `[Answer]:` tag. If none of the options fits, choose X and describe it.

## Question FD1
How long should the delivery OTP stay valid? The customer gets the SMS when the partner starts the route and may give the code an hour later. The approved Fast2SMS delivery template has its own wording; please check whether it says a validity time such as "valid for 10 minutes".

A) The code is valid for 4 hours after the route starts (PHP default). If the SMS text says a shorter time, you change the template wording to match (recommended)

B) The code is valid for 10 minutes. When the partner taps "Arrived", a new code is sent by SMS (one extra SMS per delivery)

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "A sab")

## Question FD2
A delivery fails for good (customer refused, unreachable) and the parcel comes back to the shop. What should happen to the Belzo order?

A) The order becomes `cancelled` with the reason "Undeliverable, returned to shop". Stock goes back, and a prepaid payment is refunded through the existing refund flow. The order state machine gets the missing paths `shipped` to `cancelled` and `out_for_delivery` to `cancelled` (recommended: "returned" already means a customer return after delivery)

B) The order becomes `returned` (new path `out_for_delivery` to `returned`). Stock and refund are handled by hand by the admin

C) The order goes back to `packed` so the admin can assign it again later

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "A sab")

## Question FD3
How many delivery attempts does a job get?

A) 3 attempts (PHP default, editable in settings). After the third failed attempt the partner cannot retry; the admin sees an alert and chooses reassign, return or cancel (recommended)

B) No limit; the partner can retry any time

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "A sab")

## Question FD4
Which phone number gets the delivery OTP?

A) The phone saved on the delivery address of the order (the number the customer typed for delivery); if it is missing, the account phone. An admin can correct the number for one job (audited) and the partner can resend (recommended)

B) Always the account phone of the customer

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "A sab")

## Question FD5
What does a partner see before accepting a job?

A) Only the area (city and pincode), item count and COD amount. Full address, customer name and phone appear after Accept (recommended: less data exposed if a partner rejects)

B) Everything from the start

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "A sab")
