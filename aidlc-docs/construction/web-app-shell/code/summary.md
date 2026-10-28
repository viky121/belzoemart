# Website on a Phone Like the App: Step 1 summary

Request and answers: `aidlc-docs/inception/requirements/web-app-shell-questions.md` (all A). Status: step 1 built and checked, **not deployed**. Step 2 waits for your word.

## What step 1 does (screens up to 900 px wide; a computer is unchanged)

- **Bottom bar:** Home, Categories, Offers, Cart (with the item count), Account. Rounded top, green pill behind the open tab, line icons. Left out on checkout, sign-in, sign-up, forgot-password and the order result.
- **Top bar:** only the logo and the search. The account, wishlist and cart icons and the row of category links are hidden on a phone.
- **Adding to the cart** (from a product card):
  - the picture flies into the Cart tab (not when the visitor asked for reduced motion);
  - the Cart tab bumps and shows the new count;
  - a short vibration where the browser allows it;
  - "Added to cart" with a "View cart" button above the bar;
  - a green "View cart, N items" pill with up to 3 small pictures, above the bar, while the cart has items (not on the cart page).
- **Categories page** (`/categories`): grid of the top-level categories with their pictures and up to three sub-category names.
- **Offers page** (`/offers`): products with the biggest discount first, "Up to N% OFF", loads more while scrolling, only products priced below MRP.
- **Account tab:** on a phone the Account page starts with a list of rows (My Orders, Wishlist, Addresses, Wallet, Notifications, Help and Support, Logout). The desktop side menu is hidden on a phone. The Account page also no longer sends a signed-in customer to Login when the page is reloaded (it waits until the saved sign-in has been read).

## Files

- New: `components/mobile-app-shell.tsx`, `mobile-account-menu.tsx`, `lib/mobile-shell.ts`, `lib/fly-to-cart.ts`, `lib/phone-pages.ts`, `app/(shop)/categories/page.tsx`, `app/(shop)/offers/page.tsx`, with tests.
- Changed: `(shop)/layout.tsx` (mounts the shell), `product-card.tsx` (flight), `lib/cart-api.ts` (cart event carries the pictures; the toast can carry a button), `toaster.tsx`, `infinite-products.tsx` (discount-only mode), `account/page.tsx`, `globals.css`.
- No API, database or app change.

## Verification

- Web `tsc`, `eslint` (only the old warnings), jest: 394 passed (new tests for the tab rules, the flight path, the bar, the Account list, the Categories and Offers pages).
- Looked at it in headless Chrome at 390 x 844 against the live catalogue: Home, Categories, Offers and Account show the bar; adding a product bumped the Cart tab to 1, showed the pill and the "Added to cart / View cart" message, and the flying picture was seen in the air. The cart itself was faked in that check, so nothing was written to the shop.
- Not checked: a real phone, Safari on iPhone (vibration does not exist there), and a real signed-in Account page.

## Step 2 (after you have seen step 1)

Sticky "Add to cart" bar on the product page, a short footer on phones, smoother page-to-page feel.

## Step 2 (built 2026-10-27, not deployed)

- **Product page (phones):** a bar above the bottom bar with the price (and the old price), "Add to cart" and "Buy now". Add to cart adds and stays on the page: the picture flies into the Cart tab and the message offers "View cart". Buy now goes to checkout. Out of stock switches both off. The View cart pill is not shown on product pages. The normal buy box stays for computers.
- **Footer (phones):** the logo, the links in a wrapped list, and the support line. The description, social icons, newsletter form and headings are hidden.
- **Page changes:** every page fades in (`app/(shop)/template.tsx`, opacity only: a transform would make the page the "screen" for fixed bars and move the sticky bar into the middle of the page, which showed up in the first browser check). Taps are quicker and cards and category tiles give a small press effect.
- **Checks:** web tsc, eslint, jest (398 passed, new `product-variants.test.tsx`); looked at in headless Chrome at 390 px.
- **Not checked:** a real phone, and adding to the cart from the sticky bar with a real cart (the flight itself was seen in step 1).
