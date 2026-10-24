# Admin Roles and Access - code summary

Answers Q1-Q7 = A ("a SAB"). Built, tested, committed. **Not deployed** (waiting for "deploy").

## What the user gets
- Admin menu "Staff and types" (`/admin/access`), Super Admin only.
  - **Staff** tab: list, add (name, email, password, type), change type, switch on/off, reset password, 2-step login on/off.
  - **Staff types** tab: list with staff counts, add / edit / delete, and tick boxes for what the type can do (grouped by area, "Select all" per group, "Sensitive" badges, warning line).
- 29 grantable permissions in 12 areas (view / edit / manage / bulk / download / profit levels). `staff.manage` is kept for the Super Admin and can never be given to a type.
- Ready-made types: Admin, Manager, Accountant (new) plus the five old ones (catalogue_manager, order_manager, marketing, support) now editable. Super Admin type is protected.
- Menu shows only what the admin may open; top bar shows real name and type; a page the admin may not open shows "You do not have access"; an admin without dashboard access gets a welcome page with their pages.
- Changes apply on the next click (server reads the admin's current access, 10 s cache cleared on every change). Switching someone off blocks them at once and signs them out.

## Code
- `packages/shared/src/permissions.ts` catalogue, `ROLE_TEMPLATES`, helpers (`normalizePermissions`, `withoutPermission`, `roleLabel`, `validRoleName`). `AdminRole` is now `string`.
- API `common/auth`: `permissions.decorator.ts` (`RequirePermission` any-of, `AnyAdmin`), `admin-access.service.ts`, `permissions.guard.ts` (replaces `RolesGuard`; an `/admin/*` route without a rule is refused).
- All admin controllers moved from `@Roles` to `@RequirePermission`. CSV download is `reports.export`, checked inside the report handlers.
- Identity: `admin-roles.service.ts`, `admin-user.service.ts` (staff), `admin-users.controller.ts` (`/admin/users`, `/admin/roles`), `GET /admin/auth/me`, refresh refuses a switched-off admin.
- `rbac-bootstrap.service.ts` (API only): syncs the permission list on every start; creates the ready-made types once (marker setting `rbac.templates.v1`) and moves the old roles from coarse grants to the new ones. Later edits are never undone.
- Prisma: `Role.isSystem`, migration `20261024150000_role_is_system`.
- Web: `admin-nav.ts`, `admin-session.tsx`, `no-access.tsx`, new `admin-shell.tsx`, `use-admin-page.ts` (403 no longer logs out), `access/*`, `.acc-*` CSS.

## Safety rules
You cannot switch yourself off or change your own type; the last active Super Admin cannot be switched off or moved; the Super Admin type cannot be edited, renamed, deleted or handed out from the screen; a type with staff cannot be deleted; unknown permission keys are refused.

## Behaviour notes
- One type per person in the screen; the database still allows several (older accounts) and adds them up.
- `GET /admin/products` also opens for `mobile.edit` / `content.edit` so banner and section pickers work; media upload opens for any content/product editor.
- Delivery settings and the profit report were Super Admin only; they are now permissions that can be given (flagged Sensitive).

## Verification
- API: tsc, eslint, jest 986 passed (22 real-DB skipped). New: guard, access service, roles service, staff service, bootstrap, and a scan test over every controller (every admin route has a rule).
- Real HTTP run on a scratch DB seeded the old way: bootstrap created the types; custom "Cashier" type; 200/403 matrix; change applies on next click; switched-off staff blocked; safety rules held. Scratch DB dropped.
- Shared 482, web 288 tests, web tsc / eslint / `next build` clean, mobile tsc clean.

## Before deploying
Take a DB dump first. After deploy check `/admin/auth/me`, `/admin/roles`, and sign in once as a non-Super-Admin staff to see the reduced menu.
