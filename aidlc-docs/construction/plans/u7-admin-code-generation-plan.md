# U7 admin — Code Generation Plan

Workspace root: `c:\xampp\htdocs\Belzo`. Adds Reporting, Settings, and admin audit-log backends to
`apps/api`, and the admin UI (dashboard, management screens, reports, settings) under `apps/web/src/app/
admin`. Depends on U1–U6.

## Unit Context
- **Requirements**: FR-7 (dashboard), FR-8-FR-13 admin UIs, FR-12 (reports), FR-13 (settings/RBAC/audit).
- **Business rules**: `construction/u7-admin/functional-design/business-rules.md`.
- **Depends on**: all domain modules (read/aggregate) + admin endpoints already built in U2–U6.

## Steps

- [ ] Step 1 — Shared: CSV serializer (`csv.ts`: toCsv with escaping) + PBT (`csv.test.ts`); AOV helper.
- [ ] Step 2 — Prisma models: Setting, AdminAuditLog. Migration + seed default store settings.
- [ ] Step 3 — SettingsService (typed get/set with cache + audit) + AuditLogService (record/list).
- [ ] Step 4 — ReportingService: dashboard KPIs, sales report, GST/HSN report, inventory report,
  returns report, customer report; CSV export via shared serializer.
- [ ] Step 5 — Controllers: `admin/dashboard`, `admin/reports/*` (+ `?format=csv`), `admin/settings`,
  `admin/audit` — all `@Roles` (report.read / settings.write / super_admin). Wire audit-log on settings
  writes.
- [ ] Step 6 — AdminModule + AppModule wiring.
- [ ] Step 7 — Web admin shell: `/admin` layout with sidebar nav + admin auth guard (redirect to
  /admin/login if not authed), admin API client.
- [ ] Step 8 — Web admin dashboard (KPIs + alerts).
- [ ] Step 9 — Web admin catalogue management (list/create product, publish, inventory adjust) + orders
  management (list, status transitions, create shipment).
- [ ] Step 10 — Web admin marketing (coupons/banners/CMS), customers (list), reviews moderation.
- [ ] Step 11 — Web admin reports (tables + CSV download) + settings (store/shipping/payment/COD).
- [ ] Step 12 — Tests (CSV PBT + reporting aggregation unit) + summary doc + verify (build shared,
  prisma generate, tsc, jest).

## Testable Properties carried into code (PBT-01 → PBT-03)
- CSV escaping keeps a stable column count for any field content; GST report reconciliation; AOV.

## Traceability
FR-7 → 4/8; FR-12 → 1/4/5/11; FR-13.1 (RBAC/audit) → 3/5; FR-13.2-13.5 (settings) → 3/5/11; FR-8/FR-9/
FR-10/FR-11 admin UIs → 9/10 (backends already exist in U2–U6).
