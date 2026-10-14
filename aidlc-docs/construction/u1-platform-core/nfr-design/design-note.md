# U1 platform-core — Consolidated Design Note (NFR Requirements + NFR Design + Infrastructure)

Functional Design is SKIPPED for U1 (scaffolding, no domain business logic). This note consolidates the
NFR Requirements, NFR Design, and Infrastructure Design for the platform foundation. Decisions build on
the approved Application Design and confirmed resiliency answers.

## 1. NFR Requirements — Tech Stack (pinned versions)

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript 5.x | Strict mode across web/api/shared |
| Package manager | pnpm workspaces | Monorepo; lockfile committed (SECURITY-10) |
| Frontend | Next.js 14 (App Router), React 18 | PWA via `next-pwa`; i18n via `next-intl` |
| Backend | NestJS 10 | Modular monolith + separate worker |
| ORM/DB | Prisma 5 + PostgreSQL 16 | Migrations; parameterized queries (SECURITY-05) |
| Cache/Queue | Redis 7 + BullMQ 5 | Cache + async jobs |
| Validation | zod (shared) + Nest ValidationPipe | Single schema source in `packages/shared` |
| Auth | JWT (jsonwebtoken) + argon2 | Access + refresh rotation (SECURITY-12) |
| Logging | pino + pino-http | Structured, correlation IDs (SECURITY-03) |
| Testing | Jest 29, fast-check 3 (PBT-09), Playwright | Unit + PBT + E2E |
| Lint/format | ESLint + Prettier | CI-enforced |
| Rate limiting | @nestjs/throttler | Per-route limits (SECURITY-11) |
| Security headers | helmet | CSP/HSTS/etc. (SECURITY-04) |
| Secrets | env + AWS Secrets Manager (prod) | No hardcoded secrets (SECURITY-12) |

**PBT framework selected: fast-check** (satisfies PBT-09) — added to devDependencies; supports custom
generators, shrinking, seeded reproducibility.

## 2. NFR Design — Platform-level patterns

### Security (Security Baseline)
- `helmet` middleware sets CSP (`default-src 'self'`), HSTS (max-age 31536000; includeSubDomains),
  X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin
  (SECURITY-04).
- Global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform) with zod DTOs; body size limits
  (SECURITY-05).
- `JwtAuthGuard` (deny-by-default) + `RolesGuard` + `@Public()` decorator for opt-out; object-ownership
  helper for IDOR checks (SECURITY-08).
- `ThrottlerGuard` global with stricter overrides on auth/OTP routes (SECURITY-11).
- `pino` logger with request-id interceptor; redaction of secrets/PII fields (SECURITY-03).
- Global exception filter: fail-closed, generic client messages, full server-side log (SECURITY-15).
- CORS allowlist from env; credentials true only for known origins (SECURITY-08).

### Resiliency (Resiliency Baseline)
- `HealthController`: `/health/live` (shallow) and `/health/ready` (deep: DB + Redis) (RESILIENCY-06).
- HTTP client wrapper with timeout + retry (exponential backoff) + circuit breaker (opossum) for all
  provider ports (RESILIENCY-10).
- BullMQ jobs configured with attempts + backoff + dead-letter (RESILIENCY-10).
- Graceful shutdown hooks (drain queue, close DB/Redis).
- Config validated at boot (fail fast).

### Observability
- pino JSON logs → stdout (shipped to CloudWatch in prod).
- Request/response interceptor with latency + status metrics; correlation ID propagation.
- Sentry SDK wired (DSN via env) for error monitoring.

## 3. Infrastructure Design (AWS, single-region multi-zone)

| Layer | AWS mapping (prod) | Local dev |
|---|---|---|
| Compute (api + worker) | ECS Fargate (2 AZ) behind ALB | node processes via docker-compose |
| Database | RDS PostgreSQL 16, Multi-AZ, encrypted (SECURITY-01) | postgres container |
| Cache/Queue | ElastiCache Redis (Multi-AZ) | redis container |
| Object storage | S3 (block public access) + CloudFront CDN | MinIO or local FS mock |
| Email | SES | mock adapter |
| Secrets | AWS Secrets Manager | .env (gitignored) |
| Logs/metrics | CloudWatch Logs + alarms | stdout |
| DR | Backup & Restore: automated RDS snapshots, S3 versioning (RESILIENCY-12) | n/a |

### CI/CD (GitHub Actions — RESILIENCY-04)
- Pipeline stages: install (pnpm) → typecheck → lint → unit+PBT tests → build → dependency vuln scan
  (`pnpm audit` / Trivy) → build Docker images (pinned base) → deploy (rolling) to Fargate.
- Rollback: version-pinned redeploy of previous image/task definition (RESILIENCY-04).
- Deployment style: rolling (RESILIENCY-04).

### Local Dev
- `docker-compose.yml`: postgres, redis (+ optional minio). `.env.example` documents all vars.
- `pnpm dev` runs web + api + worker concurrently.

## 4. Extension Compliance (U1 stage)
- **Security**: SECURITY-01 (RDS/S3 encryption planned), 03 (pino), 04 (helmet), 05 (ValidationPipe),
  08 (guards/CORS), 09 (no defaults, generic errors), 10 (pnpm lockfile + audit + pinned images),
  11 (throttler + isolated security modules), 12 (argon2/JWT/secrets), 15 (global filter) — all
  established at platform level. 02/06/07/13/14 partially platform (logging/headers) with infra
  specifics in later units/infra. No blocking findings.
- **Resiliency**: 03/04 (CI/CD + rollback + change note), 05/06 (health/observability), 09/10 (scaling
  config + circuit breaker/timeout wrapper), 12 (backups) established. No blocking findings.
- **PBT**: PBT-09 framework (fast-check) selected + added to deps. PBT-02 target: `packages/shared`
  money/DTO round-trips (implemented in U1 shared utils). No blocking findings.
