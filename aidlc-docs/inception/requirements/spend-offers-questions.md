# Spend and Get Special Price Offers: Questions

Your request: "If a buyer shops for ₹2000, 1 kg sugar comes at ₹29. Only 1 kg of sugar can be bought at that price. Build this kind of system, with its setup in the admin panel (available price and product offer)."

What I found in the code (checked, not guessed):
- Today there is **no offer like this**. The cart prices each line as: the variant's selling price, or a cheaper "bulk price" when the customer buys more units of the same product.
- A variant can already have a **minimum and maximum order quantity** (set in the product editor). That limit is the same for every customer and every cart. It cannot depend on how much the customer spends.
- Coupons exist, but a coupon only takes money off the whole bill. It cannot make one product cost ₹29.
- The cart (`/cart`), the checkout preview and the order placement each work out prices. The same cart service is used by the website and the mobile app, so the offer price will come out the same on both.
- Prices are stored in paise and already include GST. So ₹29 would be the final price the customer pays for the item.
- Orders save the unit price they were sold at, so a ₹29 sale is recorded correctly in the order, invoice and reports.

What I plan to do, no question needed:
- A new admin screen "Offers" (menu item, with its own "View" and "Edit" permissions so you can give it to a staff type). You add an offer with these fields:
  - Offer name (for you), on or off, optional start and end date.
  - **Spend amount** the customer must reach (for example ₹2000).
  - **Product pack** that gets the special price (for example Sugar 1 kg).
  - **Special price** (for example ₹29).
  - **Units at the special price** per order (for example 1).
- The server decides the price. The website or app can only show it. The offer is checked again when the order is placed, so a customer cannot keep the ₹29 after removing items.
- If the cart falls below the spend amount, the item goes back to its normal price straight away.
- The product page and cart show the offer: "Shop ₹2000 and get Sugar 1 kg at ₹29", and in the cart a bar like "Add ₹450 more to unlock". When unlocked, the cart line shows the special price with an "Offer" tag.
- The order, invoice and admin order page show the item at the special price and mark it as an offer item.
- Tests for the price rules, including the edge cases (exactly ₹2000, one rupee less, removing items after unlocking).

The questions below decide the rest. Fill the letter after each `[Answer]:` tag.
Shortcut: if you are fine with my recommended choice for everything, write `A sab` in Q8 and leave the rest empty.

## Question Q1
Which money counts towards the spend amount (the ₹2000)?

A) The value of the **other items in the cart**, at the prices the customer pays, before any coupon. The offer item itself is not counted, so it cannot unlock itself (recommended)
B) The whole cart value, including the offer item
C) The whole cart value **after** the coupon discount
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q2
What happens to extra units? Example: the offer is 1 kg sugar at ₹29 and the customer wants 3 packs.

A) The first pack costs ₹29. The other packs cost the normal price. The customer can still buy them, up to the product's usual maximum (recommended)
B) The customer can buy only the offer quantity of that product in total. The cart refuses a second pack while the offer is on (this matches "sugar mein bhi 1 kg hi buy kar sakte hai" exactly)
C) The admin chooses this for each offer (a tick box "Allow extra units at normal price")
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q3
Which product can an offer cover?

A) One specific **pack** (variant), for example "Sugar 1 kg". Other sizes of sugar stay at normal price (recommended)
B) A whole product, so every pack size of it gets the special price
C) A pack or a whole category (for example, any one item from "Staples" at ₹29)
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q4
Can the customer use the same offer again?

A) Once per order. Each new order that reaches ₹2000 can use it again (recommended; simplest for customers)
B) Once per customer, ever
C) The admin chooses for each offer (a setting "Once per order / Once per customer")
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q5
What if the product also has a bulk price, or the customer uses a coupon?

A) The customer gets the **lower** of the offer price and the bulk price. A coupon does not discount the offer item (recommended; protects your margin)
B) The offer price always wins over the bulk price. A coupon does not discount the offer item
C) The offer price always wins. A coupon may also take money off the offer item
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q6
Can several offers run at the same time (for example sugar at ₹29 above ₹2000 and oil at ₹99 above ₹3000)?

A) Yes, as many as you like. Each offer is checked on its own (recommended)
B) Only one offer can be on at a time
C) Yes, but a customer gets only the single best offer in a cart
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q7
Where should the customer see it, and on which apps?

A) Product page, cart and checkout, on the **website and the mobile app** together. This needs a new mobile app build after deploy (recommended)
B) Website first (product page, cart, checkout). The mobile app gets the right price from the server but no offer banner yet
C) Cart and checkout only, no banner on the product page
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q8
Anything else, or the shortcut?

A) `A sab`: accept the recommended choice for every question above
B) I have answered the questions above myself
X) Other (please describe after [Answer]: tag below)

[Answer]:
