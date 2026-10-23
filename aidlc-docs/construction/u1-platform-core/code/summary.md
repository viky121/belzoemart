# U1 platform-core — Code Generation Summary

Foundation unit for Belzo eMart. Establishes the monorepo, shared contracts, and all cross-cutting
platform concerns that U2–U7 build on. No customer-facing business logic (by design).

## Files created

### Root (monorepo)
- `package.json` — pnpm workspaces, scripts (build/typecheck/lint/test/dev/db:*), Node >= 20.11.
- `pnpm-workspace.yaml`, `tsconfig.base.json` (strict TS), `.gitignore`, `.editorconfig`.
- `.env.example` — every env var incl. provider selectors (`*_PROVIDER=mock|live`).
- `.eslintrc.json`, `.prettierrc.json`, `.prettierignore`, `README.md`.
- `.github/workflows/ci.yml` — install → typecheck → lint → test → build → dependency audit.
- `infra/docker-compose.yml` — local PostgreSQL 16 + Redis 7 with healthchecks.

### packages/shared (`@belzo/shared`)
- `src/money.ts` — `Money` branded integer-paise type; `rupeesToMoney`/`moneyToRupees`, add/subtract/
  multiply/`percentOf`/`clampNonNegative` (deterministic, PBT targets).
- `src/constants.ts` — locales, `ORDER_STATUSES` + `ORDER_TRANSITIONS` state machine, payment
  methods/statuses, product statuses, admin roles, pagination bounds.
- `src/schemas.ts` — zod schemas/DTOs (auth, address, product query, cart, checkout, `priceBreakup`,
  `gstSplit`, admin, `apiError`) — single source of truth for API contracts.
- `src/index.ts` — barrel export.
- `src/money.test.ts`, `src/schemas.test.ts` — **fast-check** property tests (round-trip, commutativity,
  identity, inverse, invariants) + example-based pins.

### apps/api (`@belzo/api`, NestJS)
- `src/main.ts` — helmet (CSP/HSTS), CORS allowlist, global `ValidationPipe`, `AllExceptionsFilter`,
  `/api` prefix + URI v1 versioning, Swagger at `/docs`, shutdown hooks.
- `src/worker.ts` + `src/worker.module.ts` — BullMQ worker context (no HTTP).
- `src/app.module.ts` — composes platform-core modules + global `ThrottlerGuard`.
- `src/common/config/` — `env.schema.ts` (zod `validateEnv`, fail-fast) + `config.module.ts`.
- `src/common/logger/` — pino logging with correlation IDs + secret/PII redaction.
- `src/common/filters/all-exceptions.filter.ts` — fail-closed, generic 5xx messages.
- `src/common/auth/` — `@Public()`/`@Roles()` decorators, `JwtAuthGuard` (deny-by-default),
  `RolesGuard` (`super_admin` override), `auth.module.ts` (global guards + JwtModule), `jwt.types.ts`.
- `src/common/prisma/` — `PrismaService` + module.
- `src/common/redis/` — `RedisService` (JSON cache helpers) + module.
- `src/common/queue/` — `QUEUES` + backoff job options, `QueueService`, module.
- `src/common/http/resilient-http.service.ts` — opossum circuit breaker + timeout for provider calls.
- `src/common/health/` — `/health/live` + `/health/ready` (DB + Redis) + module.
- `src/common/i18n/` — en/hi messages, `/welcome` sample endpoint + module.
- `prisma/schema.prisma` (HealthProbe baseline) + `prisma/seed.ts` (idempotent).
- Tests: `env.schema.spec.ts`, `roles.guard.spec.ts`.
- `Dockerfile` (multi-stage, non-root, pinned base).

### apps/web (`@belzo/web`, Next.js 14)
- `package.json`, `tsconfig.json`, `next.config.mjs` (next-intl + next-pwa + security headers),
  `next-env.d.ts`, `.eslintrc.json`.
- `src/i18n/request.ts` + `messages/en.json` + `messages/hi.json` (EN/HI).
- `src/app/layout.tsx`, `globals.css`, `(shop)/layout.tsx` + `(shop)/page.tsx` (home hero),
  `admin/page.tsx` (placeholder), `health/page.tsx` (API readiness probe).
- `src/lib/api-client.ts` — typed fetch wrapper + `ApiClientError`.
- `public/manifest.webmanifest`, `Dockerfile`.

## How to run

```bash
pnpm install
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
pnpm db:migrate:dev   # or db:migrate in CI/prod
pnpm db:seed
pnpm dev              # web :3000, api :4000 (docs at /docs)
```

Smoke tests: `GET http://localhost:4000/api/v1/health/ready`,
`GET http://localhost:4000/api/v1/welcome` (send `Accept-Language: hi`), web `http://localhost:3000`.

## Extension compliance (U1)

- **Security**: SECURITY-01 (encryption planned at infra), 03 (pino + redaction), 04 (helmet + Next
  headers), 05 (ValidationPipe + body limits + Prisma parameterization), 08 (deny-by-default guards +
  CORS allowlist), 09 (fail-fast config, generic errors, non-root image), 10 (pnpm lockfile + CI audit +
  pinned images), 11 (throttler + isolated auth), 12 (JWT secrets from env, argon2 planned in U2), 15
  (global fail-closed filter). No blocking findings.
- **Resiliency**: RESILIENCY-04 (CI/CD + rolling/version-pinned rollback documented), 05/06 (logging +
  health live/ready), 10 (circuit breaker + timeouts + queue backoff), graceful shutdown. Infra items
  (05 dashboards, 09 autoscaling, 12 backups) mapped in design note, realized during deployment. No
  blocking findings.
- **PBT**: PBT-09 framework fast-check installed; PBT-02 round-trip + PBT-03 invariant tests implemented
  in `packages/shared`. No blocking findings.

## Notes / follow-ups
- `pnpm-lock.yaml` is generated on first `pnpm install`; CI and Dockerfiles expect it committed.
- PWA icons are placeholders (`apps/web/public/icons/README.md`) pending brand assets.
- Domain tables, argon2 password hashing, and real provider adapters arrive in U2+.
