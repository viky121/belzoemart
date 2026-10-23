# Performance Test Instructions — Belzo eMart

Targets (NFR-3): page load < 3s on 4G, Core Web Vitals green, ~1,000 concurrent users, ~50,000 SKUs.

## Load testing (API)
Use k6 or Artillery against a staging deployment (never production without sign-off):
```bash
# example k6 scenario (pseudo)
k6 run --vus 200 --duration 2m load/browse-and-checkout.js
```
Key scenarios:
- Catalogue browse + search (read-heavy; validate Redis cache + DB indexes).
- Checkout place + mock webhook (write path; validate idempotency + queue throughput).

## Frontend performance
- `next build` reports per-route First-Load JS (all routes ≈ 87–111 kB shared — within budget).
- Run Lighthouse against the deployed storefront for Core Web Vitals; images use WebP + lazy loading +
  CDN in production.

## Tuning levers already in place
- Redis caching (catalogue reads, settings), DB indexes on hot columns, connection pooling (Prisma),
  stateless API + BullMQ workers for heavy jobs, CDN for media.
- Search behind an abstraction — swap PostgreSQL FTS for Typesense/Elasticsearch at scale without API
  changes.

## Status
Performance testing is defined here and executed in a staging environment during Operations; it was not
run in this local build environment.
