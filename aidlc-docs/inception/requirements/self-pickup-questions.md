# Self Pickup at Checkout: Questions

Your request: on the checkout page a customer can choose "Self pickup" (collect the order from the shop) instead of home delivery. The shop address is shown. With self pickup the customer can still pay by Cash on Delivery (pay at the shop) or pay online first. It is optional: home delivery stays the normal choice.

What I found in the current system (checked in the code):

- Checkout today: the customer picks a saved delivery address, then a payment method (COD or online). The server refuses an address whose PIN code is not in the serviceable list (today only 472001).
- Every order must have a delivery address (`addressId` is required in the database). The invoice, packing and the delivery flow all read it.
- Delivery charge today: flat Rs. 40, free over Rs. 300. COD fee today: Rs. 0 (the setting exists).
- Order steps today: Pending, Confirmed, Packed, Shipped, Out for delivery, Delivered. The admin button "Create shipment" makes a courier or in-house delivery job.
- The shop address is already in Admin Settings > Store (address, city, PIN, phone, email) and printed on the invoice.
- A Cash on Delivery order is confirmed as soon as it is placed. An online order is confirmed when the payment arrives.
- The invoice for a COD order with money to pay now prints the shop's UPI payment QR code.
- The website checkout and the Android app checkout are separate screens; both would need the change.

Fill the letter after each `[Answer]:` tag.
Shortcut: if you are fine with my recommended choice for everything, write `A sab` in Q8 and leave the rest empty.

## Question Q1
Where should self pickup be available?

A) Website and Android app, both (recommended: the app has its own checkout and customers use it)

B) Website only

C) Android app only

X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q2
What should the customer see for the pickup address?

A) The shop address from Admin Settings > Store (address, city, PIN, phone), plus one new optional Admin Settings box "Pickup timings / note" (for example "Open 10 am to 8 pm, ask at the counter"). Nothing to type again if the store address is already filled (recommended)

B) Only the shop address from Admin Settings > Store, no extra note box

X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q3
Does a self pickup customer still need a delivery address?

A) No. The address list and the PIN code check are hidden when Self pickup is chosen. The order uses the customer's name and mobile number from the account, and the shop address as the pickup place. Needs a small database change (the order remembers "pickup" or "delivery", and the address becomes optional for pickup orders) (recommended)

B) Yes, the customer still picks an address (used only as the billing address on the invoice), but the PIN code check is skipped. No database change to the address rule

X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q4
Charges for a self pickup order:

A) Delivery charge Rs. 0, and no COD fee when paying at the shop (recommended: nothing is delivered)

B) Delivery charge Rs. 0, but the COD fee setting still applies when paying at the shop

X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q5
Payment choices with self pickup, and the wording:

A) Two choices: "Pay at shop on pickup" (cash or UPI at the counter, same as COD inside the system) and "Pay online now". The COD wording changes to "Pay at shop" only when Self pickup is chosen (recommended)

B) Keep the wording "Cash on Delivery" and "Online" as they are

X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q6
How does the shop handle a pickup order in Admin > Orders?

A) Same order list. A pickup order shows a "Pickup" tag and the shop address instead of the customer address. There is no "Create shipment" button and no delivery partner job. The buttons are "Ready for pickup" (the Packed step) and "Picked up" (the Delivered step; for a pay-at-shop order this also marks the payment as received). No new order status in the database (recommended)

B) Add two brand new order statuses, "Ready for pickup" and "Picked up". More work and a larger database change

X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q7
What does the customer get to know about their pickup order?

A) The order page and the invoice show "Self pickup" with the shop address and timings. When the shop taps "Ready for pickup", the customer gets the usual notification (SMS or in-app, whatever order updates use today) saying the order is ready (recommended)

B) Same as A, plus a 4-digit pickup code shown to the customer, which the shop checks at the counter before handing over

C) Only the order page shows it, no notification

X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q8
Pickup time and switch:

A) No time slot. The customer comes after the "ready" message. Admin Settings gets one on/off switch "Self pickup" (default: on) so the shop can stop pickup orders any time (recommended)

B) The customer chooses a day and time slot at checkout. More work

C) No time slot and no switch, always available

X) Other (please describe after [Answer]: tag below)

[Answer]:
