# U1 platform-core — Code Generation Plan

Single source of truth for U1 code generation. Workspace root: `c:\xampp\htdocs\Belzo`. Greenfield
multi-unit monolith → monorepo layout (`apps/web`, `apps/api`, `packages/shared`, `infra/`).

## Unit Context
- **Unit**: U1 platform-core
- **Dependencies**: none
- **Provides to later units**: shared types/schemas, config, DB/Redis, security middleware, auth/RBAC
  guard skeletons, validation, logging, error handling, i18n, queue, health, CI/CD, Next.js shell.
- **Requirements**: cross-cutting NFR-1..NFR-6 foundations.

## Steps

- [ ] Step 1 — Monorepo scaffold: root `package.json` (pnpm workspaces), `pnpm-workspace.yaml`,
  `tsconfig.base.json`, `.gitignore`, `.editorconfig`, `.env.example`, root `README.md`.
- [ ] Step 2 — `packages/shared`: `package.json`, `tsconfig.json`, money utils (rupees↔paise),
  common zod schemas + types (Pagination, ApiError, Money), constants; barrel `index.ts`.
- [ ] Step 3 — `packages/shared` PBT: fast-check round-trip tests for money conversion and DTO
  serialize/deserialize (PBT-02, PBT-09).
- [ ] Step 4 — `apps/api` scaffold: `package.json`, `tsconfig.json`, `nest-cli.json`, `src/main.ts`
  (bootstrap + helmet + CORS + global pipes/filters + Swagger/OpenAPI), `src/worker.ts` (BullMQ worker
  bootstrap).
- [ ] Step 5 — `apps/api` common (platform-core): ConfigModule (zod-validated env), Logger (pino),
  correlation-id interceptor, global exception filter, ValidationPipe setup, ThrottlerModule,
  JwtAuthGuard + RolesGuard + `@Public()`/`@Roles()` decorators (skeleton), PrismaModule, RedisModule,
  QueueModule (BullMQ), HealthModule (`/health/live`, `/health/ready`), circuit-breaker HTTP client
  wrapper.
- [ ] Step 6 — Prisma: `apps/api/prisma/schema.prisma` (datasource + generator + a `HealthCheck` table
  placeholder), initial migration config; npm scripts for migrate/generate/seed.
- [ ] Step 7 — `apps/api` unit tests: config validation, health endpoints, guard deny-by-default,
  exception filter behavior (Jest).
- [ ] Step 8 — `apps/web` scaffold: Next.js 14 App Router, `package.json`, `tsconfig.json`,
  `next.config.js` (PWA + security headers), `next-intl` setup with `en`/`hi` message catalogs, root
  layout, route groups `(shop)` and `admin` placeholders, API client wrapper, health page.
- [ ] Step 9 — Local dev infra: `infra/docker-compose.yml` (postgres, redis), `.env.example` completion.
- [ ] Step 10 — CI/CD: `.github/workflows/ci.yml` (install→typecheck→lint→test(+PBT)→build→audit),
  ESLint + Prettier configs, Dockerfiles (pinned base images) for api + web.
- [ ] Step 11 — Documentation: `aidlc-docs/construction/u1-platform-core/code/summary.md` (files created,
  how to run, extension compliance).
- [ ] Step 12 — Verify build/typecheck locally where feasible; mark unit done.

## Extension notes
- PBT: Step 3 implements PBT-02 round-trip tests with fast-check (PBT-09 framework in deps).
- Security: Step 4/5 implement SECURITY-04/05/08/11/12/15 platform patterns; Step 10 implements
  SECURITY-10 (lockfile, audit, pinned images).
- Resiliency: Step 5 health + circuit breaker (RESILIENCY-06/10); Step 10 CI/CD + rolling/rollback
  (RESILIENCY-04).

## Story/Requirement Traceability
- U1 establishes NFR-1..NFR-6 foundations consumed by U2–U7. No customer-facing FR completed in U1 (it is
  the platform other units build on).
