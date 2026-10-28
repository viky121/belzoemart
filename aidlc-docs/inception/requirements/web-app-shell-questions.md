# Website on a Phone Like the App: Questions

Your request: on a phone the website should feel like the mobile app. Logo and search stay at the top. Categories, Offers, Cart and Account move to a bottom bar. When someone adds a product to the cart, it should visibly go into the cart and notify them. Other app features should come too.

What I found in the current system (checked in the code):

- Today a phone gets the desktop header squeezed small: logo, search, then account, wishlist and cart icons, then the category links row. There is no bottom bar.
- The website has no Categories page and no Offers page. The app has both as tabs (Home, Categories, Offers, Account). The app's Offers tab is the products with the biggest discount, biggest first.
- The app shows a floating "View cart, N items" pill above the tab bar when the cart has items. The app's menu (☰) has Home, My Profile, My Orders, Wishlist, Store Locator, Help and Support, Customer Care, Terms, Share, Logout.
- On the website, "Add to Cart" already works and shows a small "added" message at the bottom. Nothing moves to the cart, and the cart icon count only changes in the header.
- The website's "installable app" feature (PWA) is switched off in the code, because its cache once kept showing old admin pages.
- The same screen-size rule (900 px and below) is already used for the filter panel. A phone in landscape and a small tablet fall under it too.

The questions below decide the scope. Fill the letter after each `[Answer]:` tag.

Shortcut: if you are fine with my recommended choice for everything, write `A sab` in Q7 and leave the rest empty.

## Question Q1

On which screens should the app-like layout be used?

A) Phones and small tablets, up to 900 px wide. A computer keeps today's website exactly as it is (recommended)
B) Only phones, up to 600 px wide
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q2

What should the bottom bar contain?

A) Five tabs: Home, Categories, Offers, Cart, Account. The Cart tab shows the number of items, and the bar looks like the app's: rounded top, a soft coloured pill behind the open tab (recommended, this is what you described)
B) The app's four tabs (Home, Categories, Offers, Account) and the cart only as a floating "View cart" pill
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q3

The top of the page on a phone:

A) Only the logo and the search bar. The account, wishlist and cart icons and the row of category links are removed from the top (they live in the bottom bar and the Categories tab). The Wishlist and Notifications open from the Account tab (recommended)
B) Logo and search, and keep the row of category links under them
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q4

When a product is added to the cart:

A) The product picture flies into the Cart tab, the cart count bumps, the phone gives a short vibration (where the browser allows it), and a message "Added to cart" with a "View cart" button shows above the bottom bar. A floating "View cart, N items" pill (like the app) stays above the bar while the cart has items (recommended)
B) Only the message and the count change, without the flying picture and the pill
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q5

The two new pages the bottom bar needs:

A) Categories: a grid of all categories with their pictures; tapping one opens it, and the categories that have sub-categories show them (like the app's Categories tab). Offers: the products with the biggest discount first, with a "Up to N% OFF" line and endless scroll, same as the app's Offers tab (recommended)
B) Categories as in A, and Offers also shows the "spend and get" special-price offers at the top
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q6

Which other app features should the phone website get? (A bigger list makes the work bigger.)

A) Core only: the app-style Account page (a list of rows: My Orders, Wishlist, Addresses, Wallet, Help, Logout), a sticky "Add to cart" bar at the bottom of the product page, smooth page-to-page feel, and the footer shrunk to a few links (recommended)
B) Everything in A, plus the ☰ menu with the app's items, a notifications bell with the unread count, a "Recently viewed" row on Home, and pull down to refresh
C) Everything in B, plus "Add to Home Screen": the site can be installed on the phone like an app and opens full screen with the Belzo icon. This switches the installable-app feature on again; it will not cache pages, so old pages cannot come back
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q7

How should the work be done and shown?

A) Two steps. Step 1: bottom bar, new top bar, Categories and Offers pages, cart animation and pill, and the Account page. Step 2: the rest of the list chosen in Q6. I show you each step and you tell me before any deploy (recommended: it is a big change to every page)
B) All in one go
X) Other (please describe after [Answer]: tag below)

[Answer]:
