# 3 Products per Row and Category Sections on the App Home: Requirements

The questions in `phone-grid-category-sections-questions.md` were not filled in. The request was sent again with one clear answer: **this is for the Android app, not the website** (so Q1 is "the app only"). For Q2 to Q7 the recommended choice (A) was used, adapted to the app. If any of these is not what you want, tell me and I will change it.

## What was built (the mobile app only)

1. **3 products per row** on every product grid of the app: the category list, search results, Offers, and the Deals block on Home. A narrow phone (under 340 dp wide) or a phone with its text size set very large (over 1.3 times) keeps 2 per row, so nothing is squeezed.
2. **A compact card for the 3-column grid** (nothing cut):
   - the title takes up to 3 lines (a very long title ends with "..." after the third line; the full name is on the product page);
   - the price and the struck MRP sit side by side and wrap onto a second line if they do not fit; they are never limited to one line;
   - the offer ("32% OFF") is a small badge on the picture;
   - Add is a full-width button under the card (a - qty + stepper once the product is in the cart);
   - the cards of a row are the same height (room is kept for three title lines).
3. **Category blocks on Home**: after the existing home sections (banner, offers, category circles, Deals, the admin's rails) and before "Recently viewed", every home category (the same list, order and names as the circles, so categories the admin hid in the Mobile module are left out) has its own block: its name, "View all" (opens the category), the first 6 products (two rows of three), and a "See more" button.
4. **See more**: adds the next 6 products of that category right there, under the first ones; "Loading..." shows while it works. The button stays while there are products not shown, and is gone when the last ones are shown. A category with 6 or fewer products never has the button. A category with no products, or one that fails to load, shows nothing.
5. Pull to refresh on Home also reloads the category blocks.

## Not changed

- The website (phone and computer).
- The API and the database. The horizontal product rails (Recently viewed, the admin's rails) keep their cards.
- The admin cannot switch the category blocks off or move them yet (the web version of this idea had such a control; the app's Mobile module has no place for it). Say so if you want it.
