# Application Design Plan — Belzo eMart (Phase 1)

## Objective
Produce high-level component identification and service-layer design for the Belzo eMart platform:
component boundaries, interfaces/method signatures, service orchestration, and dependencies. Detailed
business logic is deferred to per-unit Functional Design in the CONSTRUCTION phase.

## Plan Steps (tracked)
- [x] Collect answers to the clarifying questions below
- [x] Analyze answers for ambiguities; add follow-ups if needed
- [x] Generate `application-design/components.md` (component definitions + responsibilities + interfaces)
- [x] Generate `application-design/component-methods.md` (method signatures + I/O types)
- [x] Generate `application-design/services.md` (service definitions + orchestration)
- [x] Generate `application-design/component-dependency.md` (dependency matrix + data flow)
- [x] Generate `application-design/application-design.md` (consolidated design doc)
- [x] Validate design completeness and consistency
- [x] Present completion message and await approval (APPROVED)

---

## Clarifying Questions

Please fill each `[Answer]:` tag. I've pre-marked a recommended option (given your MVP/AWS/Next.js+NestJS
choices) where sensible — confirm or change.

## Question A1: Backend architecture style
How should the Node.js/NestJS backend be structured for Phase 1?

A) Modular monolith — one deployable NestJS app with clear internal modules (identity, catalogue, orders,
etc.). Simplest to build/operate for an MVP; can be split into services later. (Recommended.)

B) Microservices — separate deployable services per domain from day one. More operational overhead.

C) Serverless (AWS Lambda per domain) — pay-per-use, more moving parts for a full storefront API.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question A2: Frontend app structure
How should the web frontend be organized?

A) Single Next.js app serving both storefront and admin panel, with route-group separation
(/(shop) and /admin) and role-guarded admin routes. Fewer moving parts. (Recommended for MVP.)

B) Two separate Next.js apps (storefront app + admin app) in a monorepo. Cleaner separation, more setup.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question A3: API style
What API style should the backend expose?

A) REST (OpenAPI-documented) — simple, cache-friendly, well-suited to storefront + admin + future app.
(Recommended; matches the deliverables' OpenAPI/Swagger requirement.)

B) GraphQL — flexible querying, more setup and caching complexity.

C) REST for storefront + GraphQL for admin — hybrid, more complexity.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question A4: Repository layout
How do you want the code organized in the workspace?

A) Monorepo with workspaces: `apps/web` (Next.js), `apps/api` (NestJS), `packages/shared` (types,
validation schemas, utils), `infra/` (IaC). (Recommended — shared types across web/api.)

B) Two top-level folders `frontend/` and `backend/`, no shared package.

C) Separate repositories for frontend and backend.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question A5: Authentication/session mechanism for web
How should the storefront + admin authenticate against the API?

A) JWT access token + refresh-token rotation, refresh token in httpOnly/secure/sameSite cookie.
(Recommended; aligns with SECURITY-12.)

B) Server-side sessions stored in Redis with a session cookie.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question A6: Admin and customer identity separation
Should admin users and customers share one identity system or be separate?

A) Separate tables/flows — `admin_users` (email+password+MFA, RBAC) distinct from `customers`
(OTP/email/social). Cleaner security boundary. (Recommended.)

B) Single unified user table with role flags.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question A7: Background job / async processing
Several flows are async (payment webhooks, invoice PDF, emails/SMS, abandoned-cart, ShipRocket sync).
How should these run in Phase 1?

A) A queue + worker using Redis (BullMQ) within the same codebase; workers run as a separate process.
(Recommended — matches NFR-3.4 queue workers, low overhead.)

B) AWS SQS + separate Lambda/worker services.

C) Synchronous/inline for MVP, refactor to queue later (not recommended for webhooks).

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question A8: Search implementation for Phase 1
Confirm the Phase 1 search approach.

A) PostgreSQL full-text search behind a `SearchService` abstraction, so Typesense/Elasticsearch can be
swapped in later without changing callers. (Recommended per requirements A-3.)

B) Integrate Typesense/Meilisearch now (adds infra + sync complexity).

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question A9: Design pattern for external integrations
How should Razorpay/ShipRocket/SMS/WhatsApp/email be abstracted?

A) Provider interfaces (ports) with concrete adapters + a mock adapter, selected by env var. Enables
sandbox/mock now, real creds at deploy. (Recommended per NFR integrations approach.)

B) Direct SDK calls in services (faster to write, harder to test/swap).

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question A10: Anything to add or constrain?
Are there specific components, naming conventions, or design constraints you want reflected before I
generate the design artifacts?

A) No — proceed with the design based on the above and the requirements document.

X) Other (please describe after [Answer]: tag below)

[Answer]: A
