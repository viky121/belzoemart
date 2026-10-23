# U7 admin — Domain Notes, Business Rules & Testable Properties

U7 is primarily an assembly + reporting/settings unit. Most admin backend endpoints already exist
(admin-auth, admin-users, admin-catalogue, admin-orders, admin-engagement). U7 adds Reporting, Settings,
and an admin activity audit log, plus the admin UI.

## New entities
- **Setting**: key (unique), valueJson, updatedAt — store/shipping/payment/notification settings
  (FR-13.2-13.5).
- **AdminAuditLog**: id, actorId, action, target, beforeJson?, afterJson?, createdAt (FR-13.1).

## Business rules
- BR-1 Dashboard KPIs: today's revenue (sum grandTotal of confirmed+ orders today), order count, AOV
  (revenue/orders), new customers today, pending-order count, low-stock count.
- BR-2 Sales report aggregates orders by date/status within a range; excludes cancelled from revenue.
- BR-3 GST report summarises CGST/SGST/IGST and taxable value by HSN within a range (from order
  snapshots) — NFR-2.1.
- BR-4 Inventory report: current stock, low-stock (available ≤ reorderLevel), dead-stock (no sales in N
  days).
- BR-5 Returns/refunds report; customer report (new vs repeat, counts).
- BR-6 Reports export to CSV (server builds CSV; XLSX/PDF are follow-ons behind the same shape).
- BR-7 Settings are typed key/value; reads cached; writes audit-logged.
- BR-8 Every admin mutation (settings, catalogue, order transitions, moderation) SHOULD be recorded in
  AdminAuditLog with actor + action (FR-13.1, SECURITY-13 data integrity).
- BR-9 All admin endpoints require an admin principal with the appropriate role (SECURITY-08).

## Testable Properties (PBT-01)
| Property | Category | Rule |
|---|---|---|
| CSV export escapes fields (commas/quotes/newlines) so column count is stable | Invariant (PBT-03) | BR-6 |
| GST report totals: sum of per-HSN (cgst+sgst+igst) equals sum of order tax in range | Invariant (PBT-03) | BR-3 |
| AOV = revenue / orders (0 when no orders) | Invariant (PBT-03) | BR-1 |

Most of U7 is UI + straightforward aggregation queries (integration/example-tested); the CSV serializer
and any pure aggregation helpers get PBT.
