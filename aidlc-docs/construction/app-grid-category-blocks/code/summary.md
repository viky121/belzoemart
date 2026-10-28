# App: 3 products per row and category blocks on Home: summary

Status: built and tested, **not built into an APK and not deployed** (no API change, so only an APK is needed). Requirements and the assumptions made: `aidlc-docs/inception/requirements/phone-grid-category-sections-requirements.md`.

## Changes (all in `apps/mobile`)

- `ui/use-grid-columns.ts`: `gridColumnsFor(width, fontScale)` (3, or 2 under 340 dp / text over 1.3x), `useGridColumns`, `gridCellWidth`.
- `ui/DenseProductCard.tsx`: the compact card (title up to 3 lines, price and MRP wrapping, small offer badge on the picture, full-width Add or stepper, same-height cards, explicit font weight on the regular texts so Android does not clip them).
- `ui/ProductGridCard.tsx`: picks the compact or the usual card.
- Lists using 3 columns (2 on a narrow phone): `ProductListScreen`, `SearchScreen`, `OffersScreen`, and the Deals grid in `HomeScreen`.
- `features/home/hooks.ts`: `useCategoryBlock` (6 per page, next page on demand).
- `features/home/components/CategoryProductBlocks.tsx`: the block per category with "See more".
- `HomeScreen.tsx`: the blocks after the rails, refresh reloads them.

## Checks

- Mobile `tsc`, `eslint`, jest: 328 tests passed, 55 suites. New tests: the compact card (text not limited, 3 title lines, same-height room, offer, stepper, Add), the column rule, and the category block (first 6 and See more, adds 6 at a time and the button goes after the last products, no button at exactly 6, nothing for an empty or failing category).
- Not checked: a real phone. The sizes were worked out for a 360 dp phone (a card is about 106 dp wide, its text area about 94 dp: a 3-line title holds about 45 characters, and "₹112.50" with "₹125" fits side by side). Please look at the APK on your phone, and send a screenshot if anything is cut.

## Next

An APK (0.1.20) has to be built for the phones to get this. It is built only when you say so.
