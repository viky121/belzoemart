# Delivery Module: Requirement Clarification Questions

Please fill the letter after each `[Answer]:` tag. If none of the options fits, choose X and describe it below the tag.
Background: `aidlc-docs/inception/delivery-module/php-module-analysis.md`.

## Question 1
How much of the PHP module should be converted, and in what order? (The full module is about 21,500 lines of PHP.)

A) Phased, usable early: Phase 1 core delivery (partners, zones, assign, partner PWA, delivery OTP, COD cash, customer tracking, basic admin), Phase 2 reports/CSV, audit viewer, KYC documents, notification log, Phase 3 everything else

B) Everything in one go (full port), delivered when complete

C) Only Phase 1; I will ask for the rest later

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user: "phasewise")

## Question 2
The PHP module was a separate system that the store called through an HTTP intake API (with API keys) and that called back with signed webhooks. Inside Belzo this can be direct code. What do you want?

A) Direct integration only: no API keys, no intake API, no webhooks (simplest, recommended)

B) Direct integration, plus keep the intake API, API keys and webhooks so another store or system can use the delivery module later

C) Keep the intake API and webhooks exactly as in the PHP module

X) Other (please describe after [Answer]: tag below)

[Answer]: 

## Question 3
Which Belzo orders should go to the delivery module?

A) Only orders whose delivery PIN code belongs to a delivery zone I configure (for example Tikamgarh); other PIN codes keep using the existing courier flow

B) Every order

C) Staff choose per order with a "Send to delivery" button

X) Other (please describe after [Answer]: tag below)

[Answer]: C (user: orders go to the delivery module only when an admin assigns them to a delivery partner; only that partner sees the order, nobody else)

## Question 4
When should an order enter the delivery queue?

A) Automatically when the order becomes `packed` (payment captured, or COD confirmed)

B) Automatically when the order is `confirmed`

C) Only when staff press "Send to delivery"

X) Other (please describe after [Answer]: tag below)

[Answer]: C (user: the moment an admin assigns the order to a delivery partner)

## Question 5
What happens to the existing mock shipping provider (the AWB and tracking timeline you see today)?

A) Replace it for delivery-zone orders: the in-house delivery module becomes the "courier", and the order status and tracking timeline in My Orders follow the delivery status

B) Keep it as is and run the delivery module next to it, only for staff to use

X) Other (please describe after [Answer]: tag below)

[Answer]: 

## Question 6
Staff access: who uses the delivery admin screens?

A) Reuse the existing Belzo admin login and roles; add delivery permissions (dispatcher, finance style) to the existing roles

B) Add new roles `dispatcher` and `finance` as in the PHP module, on top of the existing Belzo admin roles

C) Only super admin and admin can use it at first

X) Other (please describe after [Answer]: tag below)

[Answer]: 

## Question 7
How do delivery partners sign in?

A) Mobile number + password, account created by an admin (as in the PHP module)

B) Mobile number + OTP (SMS) each time, account created by an admin

C) Mobile number + password, with an OTP only for the first login

X) Other (please describe after [Answer]: tag below)

[Answer]: X (user: the delivery people are the shop's own staff and each has their own login; an admin creates the account and assigns orders to them. Login method, password or OTP, still to confirm: follow-up F4)

## Question 8
Where should the partner app live?

A) A mobile-first web app (PWA) on the website at /partner, installable on the phone (as in the PHP module)

B) Inside the existing Belzo Android app (extra screens for partners)

C) Both: PWA first, Android screens later

X) Other (please describe after [Answer]: tag below)

[Answer]: 

## Question 9
SMS to customers. Approved templates today: registration OTP, password reset OTP and delivery OTP. The PHP module also sends "order assigned", "cancelled", "delivered" and "failed" SMS, which need new DLT templates.

A) Customer SMS only for the delivery OTP now; assignment, cancel, delivered and failed messages go as in-app notifications (and e-mail to staff and partners) until templates are approved

B) Same as A, and I will get the extra templates approved; build the sending code now, switched off until I add the template IDs

C) No customer SMS at all except the delivery OTP, and no e-mail either

X) Other (please describe after [Answer]: tag below)

[Answer]: X (user: no SMS for assigned, cancelled, delivered and failed; send those by e-mail only. The delivery OTP stays an SMS using the approved delivery template)

## Question 10
Cash on delivery and payments.

A) Cash only: the partner records the cash received; cash in hand, settlements, adjustments and voids work as in the PHP module

B) Cash plus UPI QR (self-reported UTR, as in the PHP module). I will give the merchant UPI ID

C) Cash plus UPI QR later, after I have the UPI ID (build it, keep it switched off)

X) Other (please describe after [Answer]: tag below)

[Answer]: B (user: both cash and UPI QR. Merchant UPI ID still needed: follow-up F8)

## Question 11
Customer tracking.

A) Public link page /t/{token} (no login, no personal data) AND the same timeline inside My Orders in the website and the Android app; rating 1 to 5 after delivery

B) Only inside My Orders (website and app), no public link

C) Public link page only

X) Other (please describe after [Answer]: tag below)

[Answer]: 

## Question 12
Proof of delivery.

A) Same as the PHP module: up to 3 photos and a signature, default requirement "photo or signature" (admin can change it in Settings)

B) Photo only (required), no signature

C) No proof, only the OTP

X) Other (please describe after [Answer]: tag below)

[Answer]: 

## Question 13
Language of the new screens.

A) English only

B) English and Hindi for the partner app; admin in English

C) English and Hindi everywhere (follows the existing website/app language switch)

X) Other (please describe after [Answer]: tag below)

[Answer]: 

## Question 14
Testing effort. The PHP module has about 20,000 lines of tests.

A) Re-write tests for the core rules only: state machine, delivery OTP, cash ledger, assignment/auto-assign, money, permissions (with property-based tests where they fit)

B) Core rules plus API-level (HTTP) tests for each partner and admin endpoint

C) Minimal: only tests I need to prove the build works

X) Other (please describe after [Answer]: tag below)

[Answer]: 

## Question 15
Deployment of each phase.

A) Build and verify locally and in tests; I will say "deploy" when I want it live (as we do today)

B) Deploy to belzoemart.com at the end of each phase automatically

X) Other (please describe after [Answer]: tag below)

[Answer]: 
