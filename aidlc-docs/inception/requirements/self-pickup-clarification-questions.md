# Self Pickup at Checkout: A Few Things To Confirm

Thank you for the answers. Here is how I read them. Please tell me only if one is wrong:

- Q1: website and Android app, both.
- Q2: show the shop address and a pickup timings / note text (one new box in Admin Settings).
- Q4: delivery charge Rs. 0 and no COD fee for a pickup order.
- Q5: the payment choice is called "Pay at shop on pickup" only when the customer picked Self pickup and chose the cash option. For online payment the wording stays "Pay online". Home delivery keeps "Cash on Delivery".
- Q8: you want a pickup time slot and also an on/off switch for Self pickup in Admin Settings.

Four answers could be read in two ways, so I need one more round. Fill the letter after each `[Answer]:` tag.
Shortcut: write `A sab` in Q4 to take my recommended choice for all four.

## Question Q1
Your Q3 answer "Nahi" (do not remove the customer's address and the PIN check). What should happen with the address when the customer picks Self pickup?

A) The address step is hidden, no address is needed, no PIN check. The order uses the name and mobile number of the account. Needs a database change (the address becomes optional on an order)

B) The customer still picks a saved address (it only stays on the order as contact and billing address), and the PIN check is NOT applied: a customer from any PIN code can choose Self pickup (recommended: matches your "Nahi" for the address, and a person outside our delivery area can still come to the shop)

C) The customer still picks a saved address and the PIN check ALSO applies: an address outside the serviceable PIN list cannot use Self pickup

X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q2
Your Q6 answer "Same as Current". Today the admin flow for a delivery order is: Confirm, "Create shipment" (a courier or in-house delivery job), Packed, Shipped, Out for delivery, Delivered. How should a pickup order go?

A) Staff see a "Pickup" tag and the pickup time slot on the order. "Create shipment" is not shown (nothing is delivered). Two buttons: "Ready for pickup" (the Packed step) and "Picked up" (the Delivered step). For a pay-at-shop order, "Picked up" also marks the payment as received (recommended)

B) The same steps and button names as today (Packed, then Delivered), only "Create shipment" is hidden and Shipped / Out for delivery are skipped. Pay-at-shop payment is marked received when Delivered is pressed

C) Exactly as today, including "Create shipment" and the delivery steps. The customer would see courier steps that do not apply, and a courier job could be created for an order nobody ships. Not recommended

X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q3
Your Q7 answer "no pickup code". Should the customer still be told when the order is ready?

A) Yes. The order page and the invoice show "Self pickup", the shop address, timings and the chosen slot. When staff press "Ready for pickup" the customer gets the usual notification that order updates use today (recommended)

B) No notification. Only the order page shows the status

X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q4
You want a pickup time slot. How should it work?

A) The shop sets in Admin Settings: opening time, closing time and slot length (for example 10:00 to 20:00, 1 hour slots). The customer picks a day (today and the next 2 days) and one free slot. For today, slots that start less than 2 hours from now are not shown, so the shop has time to pack. Slot is required when Self pickup is chosen. No limit on how many orders fit in one slot (recommended, simple)

B) Same as A, plus a limit "orders per slot" in Admin Settings; a full slot cannot be chosen

C) The shop writes its own list of slots in Admin Settings (for example "10 am to 12 pm", "12 pm to 2 pm", "4 pm to 8 pm"); the customer picks a day (today and the next 2 days) and one of those. Same 2 hours' notice for today

X) Other (please describe after [Answer]: tag below)

[Answer]:

Note for all answers: the order must remember "pickup" and the chosen slot, so a database change (a new migration) is needed whatever you choose. It only adds columns; nothing existing is changed.
