# Unit Dependency Matrix & Build Sequence — Belzo eMart (Phase 1)

## Dependency Matrix (row depends on column)

| Unit \ depends on | U1 platform-core | U2 identity | U3 catalogue | U4 cart-checkout | U5 orders-fulfilment | U6 engagement |
|---|---|---|---|---|---|---|
| U1 platform-core | - | - | - | - | - | - |
| U2 identity | X | - | - | - | - | - |
| U3 catalogue | X | X | - | - | - | - |
| U4 cart-checkout | X | X | X | - | - | - |
| U5 orders-fulfilment | X | X | X | X | - | - |
| U6 engagement | X | X | X | - | X | - |
| U7 admin | X | X | X | X | X | X |

## Build Sequence (strict, one unit fully done before next)
```
U1 platform-core
  -> U2 identity
    -> U3 catalogue
      -> U4 cart-checkout
        -> U5 orders-fulfilment
          -> U6 engagement
            -> U7 admin
```

## Critical Path & Coordination
- **Critical path**: U1 → U2 → U3 → U4 → U5 (the core revenue path: browse → cart → pay → order → ship).
- **Coordination points**:
  - Shared contracts live in `packages/shared`; changing a DTO requires updating web + api together.
  - OpenAPI spec is appended to as each unit adds endpoints.
  - DB migrations are additive per unit; each unit owns its tables; foreign keys point "backwards" along
    the dependency order only.
- **Change scope per unit**: each unit is Major (new tables, new endpoints, new UI) but isolated to its
  domain; cross-cutting changes are confined to U1.

## Testing Checkpoints
- After each unit: unit + integration + applicable PBT + build green (definition of done).
- After U4 and U5: integration test of the end-to-end order path (browse → pay → confirm → ship).
- Final Build and Test stage: full suite + critical E2E flows across all units.

## Rollback Strategy (per RESILIENCY-04 = version-pinned redeploy)
- Each unit merged behind its own PR; DB migrations reversible; revert = redeploy previous artifact +
  down-migration if schema changed.

## Text Alternative
- U1 has no dependencies; every other unit depends on U1.
- U2 depends on U1. U3 depends on U1, U2. U4 depends on U1–U3. U5 depends on U1–U4.
- U6 depends on U1, U2, U3, U5. U7 depends on U1–U6.
- Build strictly in order U1..U7.
