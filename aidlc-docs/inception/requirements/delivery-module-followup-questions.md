# Delivery Module: Follow-up Questions

Your chat answers are recorded in `delivery-module-questions.md` (Q1, Q3, Q4, Q7, Q9, Q10).
What I understood so far:

- Phased build (Q1).
- An order enters the delivery module when an admin assigns it to a delivery partner (Q3, Q4). Only that partner can see it.
- Partners are the shop's own staff. An admin creates their accounts (Q7).
- Customer events (assigned, cancelled, delivered, failed) go by e-mail only. The delivery OTP stays an SMS (Q9). Customers with no e-mail on file are skipped.
- Cash and UPI QR both (Q10).

The questions below are still open. Fill the letter after each `[Answer]:` tag.
Shortcut: if you are fine with my recommended choice for everything, write `A sab` in F9 and leave the rest empty.

## Question F1 (was Q2)
Do you want an HTTP intake API, API keys and webhooks so another system can send orders to the delivery module?

A) No. Direct integration only (recommended: orders already live in Belzo)

B) Direct integration, plus the intake API, API keys and webhooks for future use

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question F2 (was Q5)
What should the customer see in My Orders once an admin assigns the order to a partner?

A) The mock shipping provider is replaced for these orders. Order status and the tracking timeline follow the delivery status (assigned, picked up, out for delivery, delivered, failed) (recommended)

B) Keep the mock shipping provider as is. The delivery module is only for staff and partners

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question F3 (was Q6)
Which admins can use the delivery admin screens (create partners, assign orders, see cash)?

A) Reuse the existing Belzo admin login and roles, and add delivery permissions to them (recommended)

B) Add new `dispatcher` and `finance` roles

C) Only super admin and admin

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question F4 (was Q7)
How does a delivery partner sign in?

A) Mobile number + password. The admin creates the account and sets the first password; the partner can change it (recommended)

B) Mobile number + OTP by SMS every time. This costs one SMS per login and needs a new SMS template

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question F5 (was Q8)
Where do partners use the app?

A) A mobile-first web app on the website at /partner, installable on the phone (PWA). Android screens can come later (recommended)

B) Inside the existing Belzo Android app only

C) Both, built together

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question F6 (new)
You said the admin assigns the order. What should happen when the partner rejects it or does not respond?

A) Manual only. The order goes back to "new" and the admin gets a notification to assign someone else (recommended)

B) Auto-reassign to the next available partner in the zone after a reject or a timeout

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question F7 (new)
Can the admin pick any partner, or only partners covering the order's pincode zone?

A) Any active partner. Zones are used only to suggest partners in the list (recommended)

B) Only partners whose zone covers the order's pincode

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question F8 (from Q10)
UPI QR needs the shop's UPI details. Please type them after the tag, for example `shopname@bank, Belzo eMart`.

Your UPI ID (VPA) and the payee name shown in the customer's UPI app:

[Answer]: jitne v amount ka payment hoga cod case me QR auto genrate ho jaye, utne amount ka and razorpay paymentgateway jo ki already implent hai uska detail ude karke, payment usi account me jaye

## Question F9 (was Q11 to Q15)
For the remaining questions I recommend the first option in each:

- Q11 Tracking: public link /t/{token} plus the timeline in My Orders (website and app), rating 1 to 5 after delivery
- Q12 Proof: up to 3 photos and a signature, default "photo or signature" (admin can change it)
- Q13 Language: English only for now
- Q14 Tests: core rules (state machine, delivery OTP, cash ledger, assignment, money, permissions) with property-based tests where they fit
- Q15 Deploy: I deploy only when you say "deploy"

A) Accept all five recommendations (also write `A sab` here to accept my recommended choice in F1 to F7 too)

X) Change some of them (describe which, after [Answer]: tag below)

[Answer]: A
