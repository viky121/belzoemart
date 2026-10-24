# Spend and Get Special Price Offers - code summary

Answers Q1-Q7 (A, B, A, A, A, A, A). Built, tested, committed. **Not deployed** (waiting for "deploy").

## What the shop owner gets
- Admin menu **Offers** (`/admin/offers`, permissions `offers.view` and `offers.edit`). Add an offer: name, spend amount, product pack, special price, units per order, optional start and end, on/off. List shows status (Live / Scheduled / Ended / Switched off), units sold, and a "Below cost price" warning (cost is admin only).
- Example: spend ₹2000, Oil/Sugar 1 kg pack at ₹29, 1 per order.

## What the customer sees (website and mobile app)
- Product page: "Shop ₹2,000 and get this at ₹29. Only 1 per order while this offer is on." The quantity stepper stops at the offer units.
- Cart: a card per offer. Locked: progress bar and "Add ₹X more to unlock". Unlocked and not in the cart: an Add button. Charged: "Offer price applied" and the cart line shows "Offer price (was ₹X)".
- Checkout, order page and invoice mark the item as an offer price.

## Rules in force (server side)
- Spend = value of the OTHER items at their normal (bulk) prices, before any coupon. The offer pack never counts towards its own offer; another offer pack counts at its normal price (no loops).
- Offer price = lower of the offer price and the bulk price; only when the pack quantity is within the offer units.
- While an offer is live (on, inside its dates) the pack is limited to the offer units per order: add, change, move back from "save for later", guest-cart merge and reorder all respect it. Checkout refuses a cart that holds more.
- A coupon ignores offer lines: the coupon base, percent, flat, minimum order and free-shipping minimum leave them out, and the offer line takes no share of the discount when GST is taken out (checkout, invoice and reports agree).
- Each order can use the offer again (no per-customer memory).
- One live offer per pack (admin save refuses a second). Many offers on different packs can run together.
- Admin save checks: special price below the normal price, units at least the pack minimum order quantity, end after start, amounts at least ₹1.
- A problem reading offers falls back to normal prices; the cart never breaks.

## Code
- Shared: `offers.ts` (rules: `evaluateOffers`, `offerUnitCaps`, `isOfferLive`, texts), `offers-view.ts` (cart cards, product banner, limits), `pricing.ts` (`PriceLine.noDiscount`, `discountableSubtotal`), `permissions.ts` (`offers.view`, `offers.edit`; added to the Admin, Manager and Marketing starter types), `report-calc.ts`, `order-view.ts`.
- Prisma: `SpendOffer`, `OrderItem.offerId/offerName`; migration `20261025100000_spend_offers` (checked: `migrate diff` against the schema is empty).
- API: `modules/offers` (`live-offers.ts`, `OffersService`, public `GET /offers/active`, admin `/admin/offers` list, `packs?search=`, create, patch, delete), `CartService` (prices, caps, `offers` in the cart response), `CheckoutService` (coupon base, order snapshot), `invoice-document.ts`, `reports.service.ts`.
- Web: `/admin/offers`, nav item, `lib/spend-offers.ts`, `lib/offers-api.ts`, `components/cart-offers.tsx`, cart / checkout / product / order pages.
- Mobile: `CartOffers` card, offer tag and API limits on cart lines, product detail banner and quantity cap.

## Verification
- API 1033 tests (22 real-DB skipped), shared 503, web 322, mobile 256 pass; tsc and eslint clean; `next build` clean.
- Scratch DB, real HTTP: offer created (price at or above normal refused, second live offer refused); public list; guest cart short of ₹2000 keeps ₹299, second pack refused with the plain message; ₹2397 of rice unlocks ₹29; back below the line restores ₹299; customer merge, preview and COD order saved `offerName` and ₹29; admin list counts 1 sold; `WELCOME10` (cap ₹200) and `FLAT100` previews leave the offer line alone; staff without `offers.view` get 403, `offers.view` only can list but not create or delete; switching the offer off lifts the limit and the price. Scratch DB dropped.
- Not checked: UI click-through in a browser or on a phone (covered by render tests and `next build`), invoice of a placed order (the app refuses invoices for pending orders; the invoice maths is unit-tested with an offer item).

## Before deploying
DB dump first (a migration is included). The first start after deploy adds `offers.view` / `offers.edit` to the permission list; the Admin, Manager and Marketing starter types get them only when the starter types are created for the first time (a fresh bootstrap). If the roles feature is already live, tick Offers for those types in "Staff and types". The mobile app needs a new APK build.
