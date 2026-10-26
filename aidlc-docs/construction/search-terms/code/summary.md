# Search Terms report: summary

Request: save what customers search for in the website and the mobile app, and add a "Search Terms" section in Reports with the keywords date wise and the most searched product. Answers: Q1 to Q7 all A. Status: built and verified, **not deployed**.

## What it does

- **Saving.** The website and the app send one small request (`POST /api/v1/search/log`, body: keyword and "web" or "app") after a real search:
  - website: the search results page opens with a keyword (Enter, the search button, "See all results", a link), or a product is picked from the header drop-down;
  - app: Enter, a tapped suggestion, a tapped recent search, or Search opened with a keyword (brand link).
  Half-typed words are never sent.
- **Saved fields.** Keyword as typed, lowercase keyword for counting, date and time, website or app, how many products were found, the product found first, and the customer if logged in (guests have none). The network address is used only for the "same search within 30 seconds counts once" rule (a short-lived Redis key) and is never saved.
- **Limits.** Public route, 30 requests a minute per address, always answers 204, a failure is ignored. Keyword: 2 to 100 characters.
- **Keeping.** Searches older than 12 months are deleted, at most once a day (after a save), in batches.
- **Report (Reports > Search terms).** Cards: searches, different keywords, searches with no result, website, app. Chart: top 10 keywords. Tables: Top keywords (with products found and the product found first), Most searched products, Not found (keywords with no product), and "Day by day" (one row per keyword per India day, newest first, 50 per page; the CSV has this table). Opens with `reports.view`, CSV needs `reports.export`. No customer names or phones are shown.

## Changes

- Database: new table `search_logs`, enum `SearchLogSource`, migration `20261025170000_search_logs` (checked on a scratch database: schema diff is empty).
- Shared: `search-term.ts` (cleaning, request schema), report types (`search-terms`, extra tables, ranked chart, page label).
- API: `SearchLogService` and the log route in the catalogue module; `reports-search.ts` with the SQL; permission text updated.
- Web: new "Search terms" tab; report page shows extra tables; `TrackSearch` on the results page; header drop-down pick saves a search.
- Mobile: `logSearch` called from the search screen. Needs a new APK.

## Verification

- shared: `tsc`, jest (512 passed + new tests).
- API: `tsc`, `eslint`, full jest (1096 passed); `reports.db.spec.ts` run against a real PostgreSQL (the new report SQL, India-day grouping, paging, CSV). The service was also run end to end on a scratch database: guest and logged-in saves, the 30 second rule, a search with no result, the report numbers, and a deleted customer keeps the search with no link.
- Web: `tsc`, `eslint` (only the old `<img>` warnings), jest (349 passed).
- Mobile: `tsc`, `eslint`, jest (296 passed).
- Not checked: a real browser or phone session against production.

## To do at deploy

1. `prisma migrate deploy` (creates `search_logs`).
2. A new mobile APK (the app is what saves app searches). Searches from the website start as soon as the web is deployed; app searches only from the new APK.
3. Old app versions simply do not send app searches.
