# Website on a Phone Like the App: Requirements

Answers (web-app-shell-questions.md): Q1 to Q7 all A ("A sab", the recommended choice).

## What will be built

Screens up to 900 px wide (phones, small tablets) get an app-like layout. A computer sees the website exactly as before (Q1 A).

### Step 1 (this step, Q7 A)

1. **Bottom bar** (Q2 A): Home, Categories, Offers, Cart, Account. Rounded top, soft coloured pill behind the open tab, the Cart tab shows the item count. It follows the app's look (green identity, same icons style). It is hidden on checkout, sign-in, sign-up, forgot-password and the order result page.
2. **Top bar** (Q3 A): only the logo and the search bar. The account, wishlist and cart icons and the row of category links are not shown. Wishlist, Notifications, Orders, Addresses, Help and Logout are reached from the Account tab.
3. **Adding to the cart** (Q4 A):
   - the product picture flies into the Cart tab (skipped when the visitor asked for reduced motion);
   - the Cart tab count bumps;
   - a short vibration where the browser allows it;
   - the message "Added to cart" with a "View cart" button, shown above the bottom bar;
   - a floating "View cart, N items" pill with up to 3 small pictures of the cart items, above the bar, while the cart has items (not on the cart page).
4. **Two new pages** (Q5 A): `/categories` (grid of all top-level categories with their pictures and the names of the sub-categories; a tap opens the category) and `/offers` (products with the biggest discount first, a "Up to N% OFF" line, endless scroll; only products that really have a discount).
5. **Account tab** (Q6 A): on a phone the Account page opens with a list of rows (My Orders, Wishlist, Addresses, Wallet, Notifications, Help and Support, Logout) like the app, then the existing details below.

### Step 2 (after you have seen step 1, Q6 A)

Sticky "Add to cart" bar at the bottom of the product page, footer shrunk to a few links, and a smoother page-to-page feel.

## Rules

- Nothing changes above 900 px.
- Pages get bottom space so the bar never hides content.
- The effect never blocks adding to the cart: if the animation cannot run, the item is still added and the message still shows.
- The Offers page shows only products with a price below their MRP.
- Nothing is deployed or built without asking you first.

## Not included

- The ☰ menu, notification bell with count, Recently viewed, pull to refresh, "Add to Home Screen" (Q6 options B and C were not chosen).
