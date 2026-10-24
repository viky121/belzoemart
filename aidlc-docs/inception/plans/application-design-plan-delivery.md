# Application Design Plan: Delivery Module (U8)

Inputs: `delivery-module-requirements.md` (approved), `execution-plan-delivery.md` (approved), the PHP analysis, and a read of the current API code.

## Plan (checklist)

- [x] Analyse the existing code the module must plug into (done, findings below)
- [x] Answer the design questions below (all A)
- [x] Generate `aidlc-docs/inception/application-design/delivery/components.md`
- [x] Generate `.../delivery/component-methods.md`
- [x] Generate `.../delivery/services.md`
- [x] Generate `.../delivery/component-dependency.md`
- [x] Generate `.../delivery/application-design.md` (consolidated)
- [x] Validate completeness and consistency against DL-1 to DL-8 and the three extensions

## What the code read showed (affects the design)

1. COD orders stay `pending` until an admin moves them. Nothing ever marks a COD `Payment` as captured, so the delivery module has to own "cash collected, payment captured".
2. The customer timeline is built from `Shipment` and `TrackingEvent` rows. If every delivery job also owns a `Shipment` (provider `inhouse`) with tracking events, My Orders and the Android app work without changes.
3. For prepaid orders a worker creates a mock shipment as soon as the order is confirmed. Assigning an order to a partner must cancel that mock shipment and stop the worker from creating one.
4. Admin guards are role-name based (`@Roles(...)`), not permission based. `JwtAuthGuard` accepts any token signed with `JWT_ACCESS_SECRET`, and customer routes do not check the token kind, so a partner token must not share that secret.
5. The payment port is order-based. Razorpay QR codes need a small extra method set (create and close a QR) and a webhook branch for `qr_code.credited`. The existing webhook table gives idempotency.
6. There are no repeatable jobs yet. The only periodic work today is a `setInterval` in the API.
7. `NotificationService.send` also sends SMS and WhatsApp when a phone is passed. The delivery e-mails must pass only the e-mail address.
8. Customers get in-app notifications; partners and admins have no notification table.
9. File storage gives public URLs only (no signed URLs).

## Questions

Fill the letter after each `[Answer]:` tag. If none of the options fits, choose X and describe it.

## Question D1
How should the code be organised in the API?

A) One `DeliveryModule` with folders per concern (partners, jobs, otp, collection, tracking, admin API, partner API, worker). Simple wiring, clear boundaries inside (recommended)

B) Three Nest modules: `delivery-core`, `delivery-collection` (cash, QR, ledger), `delivery-partner-app`. Stricter boundaries, more wiring

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "a Sab")

## Question D2
How should delivery progress reach the customer's timeline?

A) Each delivery job owns a `Shipment` (provider `inhouse`, courier "Belzo Delivery") and every status change adds a `TrackingEvent`. My Orders, the Android app and the existing order status logic keep working unchanged (recommended)

B) Separate delivery timeline API and screens, side by side with the shipment timeline

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "a Sab")

## Question D3
Who may use which delivery admin screens? (Admin guards work by role name today.)

A) `order_manager` and `super_admin`: jobs, assign, partners, zones. Cash settlement, earnings and delivery settings: `super_admin` only (recommended for a small team)

B) Two new roles. `delivery_manager`: jobs, assign, partners, zones. `finance_manager`: cash, settlements, earnings. `order_manager` can view jobs and assign. `super_admin` everything

C) Everything for `order_manager` and `super_admin`

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "a Sab")

## Question D4
How should the partner login be kept apart from customer and admin logins?

A) A separate signing secret `JWT_PARTNER_SECRET` and its own guard and refresh cookie. Customer and admin routes then reject partner tokens by design (recommended; I add the secret to the server `.env.prod` when you say deploy)

B) Same secret, new token kind `partner`, and a guard that rejects partner tokens on every other route

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "a Sab")

## Question D5
Where should the periodic work run (accept timeout, QR expiry, stale partner heartbeat, e-mail retries, OTP cleanup)?

A) BullMQ repeatable jobs on a new `delivery` queue, consumed in the existing worker process (recommended; survives API restarts, runs once)

B) `setInterval` inside the API process, like the payment sweep today

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "a Sab")

## Question D6
How does an admin learn that a partner rejected a job or did not reply?

A) The job goes back to `new` and shows a "Rejected" or "No reply" badge on the delivery dashboard and jobs list, with an audit entry. No extra notification system (recommended)

B) Same as A, and also an e-mail to an ops address set in delivery settings

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "a Sab")

## Question D7
How does a partner find out about a newly assigned job?

A) The partner app polls every 15 seconds while it is open and plays a sound or vibration on a new job (recommended for Phase 1)

B) Also add web push (needs VAPID keys and a subscription table) in Phase 1

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "a Sab")

## Question D8
Delivery proof photos and signatures.

A) Upload through the existing storage with unguessable file names, show them only inside the admin and partner screens, add real file-type checks. Private or signed URLs come in Phase 2 (recommended)

B) Build private storage with signed, expiring URLs now

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "a Sab")

## Question D9
Can an admin assign a COD order that is still `pending`? (Today an admin confirms COD orders by hand.)

A) No. Assign works for `confirmed` and `packed` orders only. The admin confirms COD orders first, as today (recommended: no hidden side effects)

B) Yes. Assigning a pending COD order confirms it in the same click

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "a Sab")
