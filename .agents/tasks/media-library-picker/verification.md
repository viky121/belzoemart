# Verification — Admin Media Library + reusable Image Picker

All commands run from `c:\xampp\htdocs\Belzo`. All passed.

| Command | Result |
| --- | --- |
| `pnpm --filter @belzo/api typecheck` | PASS |
| `pnpm --filter @belzo/api lint` | PASS (clean) |
| `pnpm --filter @belzo/api test` | PASS — 20 suites, 93 tests (incl. new `storage-list.spec.ts` + `media.controller.spec.ts`) |
| `pnpm --filter @belzo/shared test` | PASS — 7 suites, 66 tests |
| `pnpm --filter @belzo/web typecheck` | PASS |
| `pnpm --filter @belzo/web lint` | PASS (only pre-existing warnings, none in new files) |
| `pnpm --filter @belzo/web test` | PASS — 2 suites, 13 tests (incl. new `media-picker-utils.test.ts`) |
| `pnpm --filter @belzo/web build` | PASS |

## New tests
- `apps/api/src/integrations/storage/storage-list.spec.ts`
  - `LocalStorageProvider.list`: maps image files, filters non-images, excludes `invoices/`, recurses; scopes to a prefix/folder; returns `[]` when uploads dir is missing.
  - `S3StorageProvider.list`: maps `ListObjectsV2` contents → `MediaItem`s; **AccessDenied → `{ items: [] }` fallback**; empty bucket config → `{ items: [] }`.
- `apps/api/src/modules/media/media.controller.spec.ts`: folder passthrough, unknown-folder ignored, limit clamp to [1,500], newest-first sort (nulls last).
- `apps/web/src/components/media-picker-utils.test.ts`: `formatMediaSize`, `sortMediaItems` (immutability + nulls last), `formatMediaDate`.

## What was built
- Backend: `StorageProvider.list` port + `MediaItem` type; `LocalStorageProvider.list` (recursive, image-only, invoices excluded, missing-dir safe); `S3StorageProvider.list` (ListObjectsV2, image filter, degrade-to-empty on error); read-only `GET /admin/media?folder=&limit=` (role-guarded, capped 500, newest-first).
- Frontend: `adminListMedia` + `MediaItem` in `admin-api.ts`; pure helpers in `media-picker-utils.ts`; reusable `<MediaPicker>` modal (Library + Upload tabs, details on each tile, graceful empty/unavailable note); `.mediapick*` styles in `admin.css`.
- Wiring (direct uploaders kept intact, "Choose from library" added beside each): categories page (add + inline edit → category icon), product-wizard (category chip edit + product images), product-editor (images), and `ImageDrop` (covers content-editor hero + banner blocks).

Backward compatible / additive: no change to how image URLs are stored, nor to the existing upload endpoint/`adminUpload`.
