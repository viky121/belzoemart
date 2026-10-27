# Admin Reports: Code Summary
Request: build Admin 11 Reports (Basic sales, Purchasing, Order, User, Product, P/L, plus Category, Brand, Best-seller and Payment reports).
Decisions (from `aidlc-docs/inception/requirements/admin-reports-questions.md`): Q1 = C (Purchasing report skipped for now, there is no purchasing data in the system), Q2 = A (cost saved on each order item from now on, older orders use today's cost and are marked estimated), Q3 = A (gross profit only), Q4 = A (profit and loss for `super_admin` only), Q5 = A (one tabbed page, shared date filter, totals, chart, table, CSV on every report).

## What was built
| Area | Files |
|---|---|
| Shared maths | `packages/shared/src/report-calc.ts` (India-day ranges and quick filters, order lines with GST and discount share, refunds, cost, P/L, grouping), `report-types.ts` (the one response shape), tests `report-calc.test.ts` (examples and property tests) |
| Database | `OrderItem.costPrice Int?` + migration `20261024090000_order_item_cost_snapshot` (additive, nullable) |
| Checkout | `CheckoutService.place` saves each variant's cost on the order item (a lookup failure never blocks an order) |
| API | `modules/admin/reports.service.ts`, `reports.controller.ts` (routes `GET /api/v1/admin/report/:id` and `/admin/report/profit-loss`), registered in `admin.module.ts` |
| Privacy | `OrderService` now strips `costPrice` from the customer order detail, the admin order detail and the admin order list |
| Web | `apps/web/src/app/admin/reports/` (`page.tsx`, `report-view.tsx`, `gst-stock-tab.tsx`, `report-format.ts`), `adminDownload` in `lib/admin-api.ts`, styles in `admin.css` |

## Reports
| Tab | Who | Shows |
|---|---|---|
| Sales | order_manager, marketing, super_admin | orders, gross sales, discounts, fees, GST, net sales, total, average order, refunds, cancelled; day-by-day table and chart |
| Orders | same | every order of the period (any status), status filter, paging, status counts |
| Users | same | new sign-ups, customers who ordered, repeat customers, blocked; top 500 customers by spend |
| Products | same | units, returns, orders, sales (without GST), average price per product |
| Categories, Brands | same | units, orders, sales, share of sales |
| Best sellers | same | top 20 products by units |
| Payments | same | received, waiting (COD and unpaid), refunded, failed, by method |
| Profit and loss | super_admin only | revenue, cost, gross profit, margin, refunds; per product with cost status (saved, estimated, missing) and a daily profit chart |
| GST and stock | same as Sales | the older GST summary and low-stock download, now with a working download button |

## Rules worth knowing
- Sales counts orders that are confirmed or later. Pending, cancelled and returned orders are left out of the figures (the Orders tab shows them).
- Days are India days (IST). A period can be at most 366 days and at most 20,000 orders; a bigger period gets a clear "pick a shorter period" message.
- Sales are without GST and after the order discount. Refunds come from returns that reached `refunded`; returned units leave sales and their cost leaves cost (they go back on the shelf).
- Items with no cost price at all count as zero cost and are flagged, because their profit is overstated.
- CSV: money in rupees, UTF-8 with a byte-order mark so Excel opens it correctly.
- Older `reports/*` routes (`sales`, `gst`, `inventory`, `returns`, `customers`, `sales-trend`) are unchanged; the dashboard still uses them.

## Verification
- Shared: tsc, 459 tests. API: tsc, eslint, 895 passed (+22 skipped real-DB tests). Real database run of the new `reports.db.spec.ts` (scratch Postgres, all migrations applied): 4 passed, then the scratch database was dropped. Web: tsc, eslint on the new files, 252 tests. Mobile: tsc, 248 tests (one search test failed once under load and passed on re-run and alone).
- Not done: a click-through of the page in a browser, and an authenticated call against a running API.

## Deploy notes
One additive migration (`order_items.costPrice`). Nothing needs to be set on the server. Existing orders keep `costPrice = null`, so their profit uses today's cost price and is marked estimated until new orders come in.
Purchasing report: not built. It needs a purchase entry form first (Q1 option A) if wanted later.
