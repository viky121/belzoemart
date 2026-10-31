# System Test Report - 2026-10-31

Scope: whole system (shared, API, web, mobile, database, live site, server). Production was tested **read-only**: no orders placed, no deploy, no build of the apps on the server, no APK build.

Tested commit: `603aa21` plus the Wallet link fix described in finding M3 (local, not deployed).

## 1. Result at a glance

| Area | Result |
|---|---|
| shared tests | 512 passed |
| API tests | 1116 passed, 23 skipped (2 suites need a database; run separately, see below) |
| web tests | 401 passed |
| mobile tests | 328 passed |
| TypeScript (all 4 packages) | clean |
| ESLint | 0 errors (web: 4 old warnings, 3 x `<img>`, 1 x hook dependencies) |
| Database on a scratch copy | all 16 migrations apply, schema drift = none, DB-backed report tests 5/5 pass |
| Web production build (`next build`) | passes |
| Live site: pages, public API, auth guards, input checks | all as expected (details in section 3) |
| Production data integrity | 0 mismatches in totals, GST split, payments, invoices |
| Server | healthy, 0 restarts since last deploy |

## 2. Findings, ranked

### High
- **H1. Next.js 14.2.5 is old.** `pnpm audit --prod` lists about 35 advisories for it (several high: denial of service through Server Components and Server Actions, authorization bypass, cache poisoning; some critical: Image Optimization remote code execution with AVIF/SVG, middleware bypass). Reachability on this site: there is no `middleware.ts` (so the middleware bypass does not apply), and `/_next/image` answers 400 for any non-configured URL. The denial-of-service ones apply. Fix: upgrade to the latest 14.2.x (14.2.35, small change) or to 15.5.x (bigger change). Needs a decision and a deploy.
- **H2. No automatic database backup.** Backups exist only as manual `pg_dump` files taken before deploys, stored on the same server (latest `~/belzo-backup-2026-10-31-0925-predeploy.sql`). No cron job, no copy off the server. If the server disk or the instance is lost, order data is lost. Fix: daily `pg_dump` by cron plus copy to S3 (or any other place), keep 14 days.

### Medium
- **M1. Dependency vulnerabilities (rest of the 100 found).** 4 critical, 37 high, 44 moderate, 15 low overall. High ones outside Next: API `body-parser`, `multer`, `path-to-regexp`, `lodash`, `js-yaml` (denial of service / code injection through NestJS dependencies), `zod` (memory use with huge arrays), web build `postcss` and `source-map-js`, mobile build tool `node-forge`. Most are fixed by `pnpm update` inside the allowed version ranges; run the test suites after.
- **M2. Server memory is tight.** 1.9 GB RAM, 750 MB available, 182 MB swap in use. On 2026-10-27 the kernel killed `dockerd` for lack of memory (the outage of that day). Building images on the server needs about 25 minutes when swapping. Fix: bigger instance (4 GB), or build images elsewhere and only pull them on the server.
- **M3. Dead "Wallet" link on the phone Account tab.** `/wallet` returns 404 because the website has no wallet page. My own mistake from the mobile-view work. Fix written (row removed, test updated) but **kept as a draft on branch `draft/wallet-link-fix`**, not on `main`, by the user's decision on 2026-10-31. Until it is merged, the dead Wallet row stays on the live site.
- **M4. Cash on delivery is not recorded as paid.** One delivered COD order still has its payment as `pending`. Cash collection and proof (plan U8.2, `aidlc-docs/construction/plans/u8-2-collection-cash-proof-code-generation-plan.md`) is not built yet, so COD revenue shows as unpaid in payment views.
- **M5. 8 old pending COD orders** from 2026-09-30 onward (test orders made before the COD fix) sit in the pending list with a "Confirm order" button. Confirming one by mistake would create an invoice and shipment work. Safe for stock (confirming consumes at most what is reserved), but they should be cancelled. The admin screen has no cancel button; the API `POST /admin/orders/:id/cancel` exists.
- **M6. Missing data for reports.** 1027 of 1127 variants have no cost price (profit and loss report is incomplete). 4 products have no HSN code (needed on a GST invoice). 26 products have no brand. 44 products have tax 0%.

### Low
- **L1.** `/robots.txt` and `/sitemap.xml` return 404. Search engines get no sitemap.
- **L2.** `/category/<unknown slug>` returns HTTP 200 (should be 404).
- **L3.** Web pages send no `Content-Security-Policy` and no `Permissions-Policy` header (the API sends CSP). Other headers are present (HSTS, nosniff, frame deny, referrer policy).
- **L4.** Speed: web pages take 1.0-1.6 s until the full response (home 1.25-1.6 s), API 0.6-0.9 s, measured from the test machine. The API health check alone takes 0.58 s, so about half of it is network distance to the server.
- **L5.** 1 pending online (mock) order from 2026-10-04 was never auto-cancelled (the cleanup job handles Razorpay orders).
- **L6.** Reserved stock is 4 units, while pending orders hold 12 units. Old pending orders were placed before reservation behaved as now. Harmless today; the numbers match again once the 8 old orders are cancelled.
- **L7.** 4 empty categories (no published product), 11 customers still named "Belzo Customer", 19 customers without an address (informational).
- **L8.** Docker build cache on the server is 4.9 GB (3.2 GB can be freed with `docker builder prune`). Disk is at 47% so it is not urgent.
- **L9.** Prisma 5.18 is installed, 8.0 is out. Informational, no action needed now.

### Razorpay: "18 of 20 payments failed" explained
The 18 failed rows have **no gateway payment id**: the customer opened checkout and never paid, and the order was auto-cancelled. The gateway itself reported only 3 failures (2 timed out, 1 cancelled by the customer). So this is abandoned checkouts, not a gateway fault. Two online payments were captured and both orders were delivered. All 11 webhooks were processed.

## 3. Live checks (read-only)

- Pages: home, categories, offers, cart, search, login, signup, download, CMS pages, product page, all 10 top categories return 200. Unknown product and page return 404.
- Public API: health, categories, brands (with category filter), products (paging, sort), search, autocomplete, settings, serviceability, banners, CMS, offers all return 200.
- Login-required endpoints (me, addresses, orders, wishlist, notifications, all `/admin/*`, checkout, order confirm/cancel) return 401 without a token.
- Bad input returns 400, not 500 (bad uuid, page -1, page size 100000, unknown sort, 5000-character search, empty or malformed JSON). SQL-injection and script text in search is handled (200, no error). Wrong password returns 401 with a message that does not say whether the account exists.
- No exposure of `.env`, `.git`, compose file, backups, API docs.
- TLS 1.3, Let's Encrypt certificate valid until 2027-01-11, HTTP redirects to HTTPS, `www` works, HSTS on, API rate limit 100 requests per minute (header present), a foreign origin gets no CORS permission.

## 4. Server (read-only)
Up 35 days, load 0.4. Containers: web, api, worker (restarted at last deploy), caddy, postgres, redis (healthy). 0 restarts, none killed for memory since. Disk 13 GB of 29 GB used. Last 24 h: no errors in web and worker, API shows only warnings caused by 401/404 probes. Redis 4.6 MB, Postgres 12 connections, database 18 MB.

## 5. Database
Production: 40 customers, 1127 published products (all with an active variant, image, description, stock row; none priced above MRP), 115 categories, 193 brands, 259 search log rows, 16 migrations applied, none failed.
Orders: 21 cancelled, 6 delivered, 1 packed, 1 shipped, 9 pending. Checks on order totals, GST split (CGST + SGST + IGST = tax), payment amount = order total, item sums, invoices on every confirmed order and duplicate invoice numbers all found 0 problems.

## 6. Not tested
- Real payment, real SMS/OTP, real courier flow (would write to production or cost money).
- Load testing (would disturb the live site on a 1.9 GB server).
- Mobile app on a device: automated tests only. Latest APK 0.1.20 (finished): https://expo.dev/artifacts/eas/65nbrYzfVtomDOI238fpsN5Lus4TtO908BkHpyQ5x0I.apk

## 7. How to repeat
- shared: `cd packages/shared && npx tsc -p tsconfig.json && npx jest`
- API: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx eslint "src/**/*.ts" && npx jest`
- web: `cd apps/web && npx tsc --noEmit && npx eslint src && npx jest && NEXT_PUBLIC_API_URL=http://localhost:4000 npx next build`
- mobile: `cd apps/mobile && npx tsc --noEmit && npx eslint src && npx jest src`
- database: create a scratch database, `npx prisma migrate deploy`, `npx prisma migrate diff --from-url <url> --to-schema-datamodel prisma/schema.prisma --script` (expect "empty migration"), then `REPORTS_DB_TEST_URL=<url> npx jest src/modules/admin/reports.db.spec.ts`
- dependencies: `pnpm audit --prod`

## 8. Recommended order of work
1. Daily automatic backup with an off-server copy (H2).
2. Cancel the 8 old pending COD orders (M5).
3. Upgrade Next.js to 14.2.35 or newer, update API dependencies, test, deploy (H1, M1).
4. Deploy the Wallet link fix (M3).
5. Add robots.txt, sitemap.xml, real 404 for unknown categories, web CSP (L1-L3).
6. Fill cost price, HSN and brand in the catalogue (M6).
7. Larger server (M2).
