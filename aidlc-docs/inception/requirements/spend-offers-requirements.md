# Spend and Get Special Price Offers: Requirements

Request: "If a buyer shops for ₹2000, 1 kg sugar comes at ₹29. Only 1 kg of sugar can be bought. Build this kind of system with admin setup."
Depth: standard. User stories, application design and units skipped (one feature, one unit of work across API, web, mobile).

## Decisions (from the answers)
| Q | Answer | Meaning |
|---|---|---|
| Q1 | A | Spend = value of the OTHER items in the cart at the prices the customer pays, before any coupon. The offer pack does not count towards its own offer. |
| Q2 | B | While an offer is on, the pack can be bought only up to the offer units per order (default 1). A second pack is refused in the cart. |
| Q3 | A | An offer covers one pack (variant), for example "Sugar 1 kg". |
| Q4 | A | Once per order. Every new order that reaches the spend amount can use it again. |
| Q5 | A | The customer gets the lower of the offer price and the bulk (slab) price. A coupon does not discount the offer item. |
| Q6 | A | Many offers can run at the same time. Each is checked on its own. |
| Q7 | A | Product page, cart and checkout on the website and the mobile app. |

## Functional requirements
- FR-O1 Admin screen "Offers": list, add, edit, switch on/off, delete. Fields: name, spend amount (₹), pack (variant), special price (₹), units per order, optional start and end date.
- FR-O2 Rules enforced on save: special price below the pack's normal price; units at least the pack's minimum order quantity; at most one live offer per pack; end after start; spend amount above zero.
- FR-O3 The server prices the cart. When the other items reach the spend amount, the offer pack's line costs min(offer price, bulk price). Below the spend amount it costs the normal price straight away.
- FR-O4 While an offer is on (switched on and inside its dates) the pack's per-order maximum is the smaller of the product's own maximum and the offer units. Adding more is refused with a plain message. A cart that already holds more must be fixed before checkout.
- FR-O5 Coupons ignore the offer line: the coupon base, percent, flat and category rules do not include it.
- FR-O6 Checkout preview and order placement use the same cart prices, so the offer is re-checked when the order is placed.
- FR-O7 The order item keeps the offer id and name; the admin order page, invoice and customer order show an "Offer" tag. Offer sales are counted in the admin list.
- FR-O8 Public "active offers" list for the product page and cart. Product page shows "Shop ₹X and get this at ₹Y". The cart shows a progress bar per offer ("Add ₹450 more to unlock") and, once unlocked, an Add button when the pack is not in the cart.
- FR-O9 Admin sees a warning when the special price is below the pack's cost price (cost is admin-only).
- FR-O10 New permissions `offers.view` and `offers.edit`, added to the Admin, Manager and Marketing starter types.

## Non-functional
- Prices stay in paise and GST inclusive; the ₹29 is the final price paid.
- Unit-tested rule engine with edge cases (exactly the spend amount, one paisa less, removing items after unlocking, bulk price lower than the offer).
- No change to existing orders. New nullable columns only.
- Mobile app change needs a new APK build; website and API are deployed only when the user says "deploy".
