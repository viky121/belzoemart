# Belzo eMart

Single-vendor B2C e-commerce portal (Phase 1: responsive web storefront + admin panel). Built with
Next.js, NestJS, and PostgreSQL. Integrates Razorpay (payments) and ShipRocket (logistics). Supports
English + Hindi, transacts in INR.

Built following the AI-DLC workflow — see `aidlc-docs/` for requirements, design, and construction docs.

## Monorepo layout

```
apps/
  web/         Next.js storefront + /admin (PWA, i18n en/hi)
  api/         NestJS modular monolith + BullMQ worker
packages/
  shared/      Shared TS types, zod schemas, money utils (source of truth for API contracts)
infra/         docker-compose (local), IaC (AWS)
aidlc-docs/    AI-DLC documentation (requirements, design, construction)
```

## Prerequisites

- Node.js >= 20.11
- pnpm >= 9
- Docker (for local PostgreSQL + Redis)

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment file and adjust as needed
cp .env.example .env

# 3. Start local infrastructure (PostgreSQL + Redis)
docker compose -f infra/docker-compose.yml up -d

# 4. Run database migrations and seed
pnpm db:migrate
pnpm db:seed

# 5. Start web + api (and worker) in dev mode
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000 (OpenAPI docs at `/docs`)
- Health: `GET /api/v1/health/live`, `GET /api/v1/health/ready`

## Scripts

| Command | Description |
|---|---|
| `pnpm build` | Build all workspaces |
| `pnpm typecheck` | Type-check all workspaces |
| `pnpm lint` | Lint all workspaces |
| `pnpm test` | Run all tests (unit + property-based) |
| `pnpm dev` | Run web + api in parallel (dev) |
| `pnpm db:migrate` | Apply Prisma migrations |
| `pnpm db:seed` | Seed demo data |
| `pnpm format` | Format with Prettier |

## Quality & compliance

This project enables three AI-DLC extensions as blocking constraints:

- **Security Baseline** — encryption, input validation, JWT rotation, RBAC/IDOR checks, security headers,
  structured logging, secret management, dependency scanning.
- **Resiliency Baseline** — health checks, circuit breakers, retries, queue decoupling, automated
  backups, rolling deploys with version-pinned rollback.
- **Property-Based Testing** — fast-check for pricing/tax/coupon/inventory logic and serialization
  round-trips.

## Integrations

All external integrations (Razorpay, ShipRocket, SMS, WhatsApp, email, storage) sit behind provider
interfaces with **mock adapters** selected by env var, so the app runs fully locally. Set the relevant
`*_PROVIDER=live` and supply credentials to switch to real services.

## Status

Phase 1 build in progress via AI-DLC per-unit construction (U1 platform-core → U2 identity → U3
catalogue → U4 cart-checkout → U5 orders-fulfilment → U6 engagement → U7 admin).
