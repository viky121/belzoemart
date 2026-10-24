# Unit of Work Plan: Delivery Module (U8)

Inputs: approved execution plan (units U8.1 to U8.5), approved application design.
Belzo is one deployable system (API, worker, web), so units here are build slices of the same system, not separate services.

## Plan (checklist)

- [x] Take the proposed split from the approved execution plan
- [x] Answer the questions below (all A)
- [x] Generate `aidlc-docs/inception/application-design/delivery/unit-of-work.md` (units, responsibilities, code locations)
- [x] Generate `.../delivery/unit-of-work-dependency.md` (dependency matrix and build order)
- [x] Generate `.../delivery/unit-of-work-story-map.md` (requirements DL-x mapped to units; stories were skipped)
- [x] Validate boundaries: every DL requirement of Phase 1 belongs to exactly one unit
- [x] Present for approval

## Proposed units

| Unit | Content |
|---|---|
| U8.1 Delivery core | shared status machine and schemas, Prisma models and migration, partners and zones, partner auth, assignment, status changes, delivery OTP, settings, worker jobs |
| U8.2 Collection and cash | cash, Razorpay UPI QR, webhook branch, ledger, settlements, earnings, `Payment` sync |
| U8.3 Admin screens | `/admin/delivery/*`, Assign button on the order detail |
| U8.4 Partner app | `/partner/*` PWA |
| U8.5 Customer side | `/t/[token]`, rating, e-mails, in-app notifications, My Orders label check (web and Android) |

Because of design decision D2, the Android app needs no new screens; U8.5 only checks that the new tracking labels show correctly there.

## Questions

Fill the letter after each `[Answer]:` tag. If none of the options fits, choose X and describe it.

## Question U1
In what order should the units be built?

A) U8.1, U8.2, U8.3, U8.4, U8.5. Each unit is finished and tested before the next one. You can try the full flow (assign, deliver, collect) after U8.4 (recommended)

B) U8.1, U8.3, U8.4, U8.2, U8.5. You can try assign and delivery of prepaid orders earlier; cash and QR come after

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user said "approve" = accept the recommended option)

## Question U2
When should database migrations be created?

A) One additive migration per unit, only for the tables that unit needs (recommended: small and easy to review)

B) One migration with all delivery tables at the start of U8.1

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user said "approve" = accept the recommended option)

## Question U3
How deep should the per-unit design stages go?

A) Functional Design for U8.1, U8.2 and U8.5 (rule-heavy). A short screen-flow note for U8.3 and U8.4. NFR Design for U8.1, U8.2 and U8.4 (auth, OTP, webhook, PWA). Skip it for U8.3 and U8.5 (recommended)

B) Full Functional Design and NFR Design for every unit

X) Other (please describe after [Answer]: tag below)

[Answer]: A (user said "approve" = accept the recommended option)
