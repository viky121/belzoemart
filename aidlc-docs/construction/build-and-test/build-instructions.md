# Build Instructions — Belzo eMart

## Prerequisites
- Node.js >= 20.11, pnpm >= 9, Docker (for local PostgreSQL + Redis).

## One-time setup
```bash
pnpm install
cp .env.example .env                 # adjust as needed
docker compose -f infra/docker-compose.yml up -d   # postgres + redis
pnpm --filter @belzo/shared build    # shared must be built before api/web
pnpm --filter @belzo/api db:generate # prisma client
pnpm db:migrate:dev                  # create schema (dev) — or db:migrate in CI/prod
pnpm db:seed                         # roles, admin, sample catalogue, coupons, CMS, settings
```

## Build all workspaces
```bash
pnpm build            # builds shared → api → web (topological order)
```
Individual:
```bash
pnpm --filter @belzo/shared build    # tsc → dist (library, emits .d.ts)
pnpm --filter @belzo/api build       # nest build → dist (declaration emit disabled)
pnpm --filter @belzo/web build       # next build (production)
```

## Run (development)
```bash
pnpm dev                 # web :3000 + api :4000 in parallel
pnpm --filter @belzo/api start:worker   # BullMQ worker (invoices, shipments, notifications, DPDP)
```

## Verified build results (this stage)
- `@belzo/shared` build: **OK**
- `@belzo/api` build (`nest build`): **OK** (fixed: declaration emit disabled for the app — internal
  service return types no longer need to be exported)
- `@belzo/web` build (`next build`): **OK** — all storefront + admin routes compiled

## Notes
- `pnpm-lock.yaml` is generated on first install and committed; CI uses `--frozen-lockfile`.
- Shared package builds first; api/web consume `@belzo/shared` from its built `dist`.
- Real integration credentials (Razorpay, ShipRocket, SMS/WhatsApp/email, S3) are supplied via env at
  deploy; local/dev uses mock adapters (`*_PROVIDER=mock` / `STORAGE_PROVIDER=local`).
