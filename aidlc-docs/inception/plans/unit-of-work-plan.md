# Unit of Work Plan — Belzo eMart (Phase 1)

## Objective
Decompose the Belzo eMart platform into buildable units of work (logical modules within the modular
monolith), each fully designed and coded before the next, in dependency order.

## Plan Steps (tracked)
- [x] Collect answers to decomposition questions below
- [x] Analyze answers for ambiguities; add follow-ups if needed
- [x] Generate `application-design/unit-of-work.md` (unit definitions + responsibilities + code org)
- [x] Generate `application-design/unit-of-work-dependency.md` (dependency matrix + build sequence)
- [x] Generate `application-design/unit-of-work-story-map.md` (map FR/components to units)
- [x] Validate unit boundaries and that all components/requirements are assigned
- [ ] Present completion message and await approval

---

## Proposed Units (baseline for discussion)
Derived from the build order in `component-dependency.md`:

1. **U1 platform-core** — monorepo scaffold, shared package, config, DB/Redis setup, security middleware,
   auth/RBAC guards, validation, logging, error handling, i18n, queue, health, CI/CD skeleton.
2. **U2 identity** — customers (OTP/email/social), addresses, admin_users, RBAC, JWT rotation, DPDP flows.
3. **U3 catalogue** — categories, products, variants, attributes, brands, inventory, media, search (FTS).
4. **U4 cart-checkout** — cart, pricing, tax, coupon, checkout orchestration, Razorpay payment.
5. **U5 orders-fulfilment** — order state machine, GST invoices, ShipRocket fulfilment, returns, refunds.
6. **U6 engagement** — wishlist, reviews/Q&A, wallet/loyalty/referrals, notifications, CMS/banners/legal.
7. **U7 admin** — admin UI + dashboard, catalogue/order/marketing/customer management, reports, settings.

---

## Decomposition Questions

Please fill each `[Answer]:` tag. Recommended options are pre-marked.

## Question U-1: Unit granularity
Do you agree with the 7-unit decomposition above, or prefer different granularity?

A) Accept the 7 units as proposed (platform-core, identity, catalogue, cart-checkout, orders-fulfilment,
engagement, admin). (Recommended — matches dependency order and keeps units cohesive.)

B) Fewer, larger units (e.g., merge engagement into admin, or catalogue+cart together).

C) More, smaller units (e.g., split payment from cart-checkout, split returns from orders).

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question U-2: Build sequence
Units will be built in dependency order (U1 → U2 → U3 → U4 → U5 → U6 → U7), each fully designed and coded
before the next. Confirm?

A) Yes — strict dependency order, one unit fully completed before the next. (Recommended.)

B) I want a different order (specify in Other).

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question U-3: Admin frontend timing
The admin panel (U7) needs backend APIs from U2–U6. When should admin UI be built?

A) Build admin UI last as U7, after all backend domains exist. Backend admin endpoints are built within
each domain unit as they're created; U7 assembles the admin UI on top. (Recommended.)

B) Build a minimal admin UI incrementally alongside each domain unit.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question U-4: Storefront frontend timing
Similarly, when should the customer storefront UI be built?

A) Build storefront pages incrementally within each relevant unit (e.g., catalogue pages in U3, cart/
checkout pages in U4, order pages in U5), so each unit is independently demoable end-to-end.
(Recommended — each unit ships a usable slice.)

B) Build all backend first, then all storefront UI at the end.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question U-5: Definition of "done" per unit
What must be true for a unit to be considered complete before moving on?

A) Code + unit/integration tests + applicable PBT + passing build + updated OpenAPI + brief unit summary
doc. (Recommended; aligns with enabled extensions and verification requirements.)

B) Code + basic tests only; defer PBT and docs to the end.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question U-6: Seed/demo data
Should each unit include seed data (sample categories/products/users) to make it demoable?

A) Yes — provide idempotent seed scripts (admin user, sample catalogue across the 4 categories, test
customer) so flows can be exercised locally. (Recommended.)

B) No seed data; use empty database.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question U-7: Anything to change about unit boundaries or naming?

A) No — proceed with the plan as above.

X) Other (please describe after [Answer]: tag below)

[Answer]: A
