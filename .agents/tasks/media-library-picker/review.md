# Admin media library + reusable image picker

Adds a read-only media-listing capability to the storage layer and a reusable `MediaPicker` modal so admins can reuse an already-uploaded server image (with its details) anywhere an image or icon is set, instead of only re-uploading. The storage port gains `list(prefix?, limit?)`; the local adapter walks `<cwd>/uploads` recursively and the S3 adapter uses `ListObjectsV2`, degrading to an empty list on any error (e.g. `AccessDenied`) so the picker falls back to upload-only. A new role-guarded `GET /admin/media` surfaces the listing. On the frontend a `MediaPicker` with Library + Upload tabs is wired beside (never replacing) the existing uploaders in the categories page, product-wizard (category icon + product images), product-editor, and the shared `ImageDrop` (which covers the content-editor hero and banner-block image fields). The change is additive: image URLs are still persisted on records exactly as before, and the existing upload endpoint/`adminUpload` are untouched.

Watch for: nothing blocking. One cosmetic dead-code path (the in-modal "selected" preview never renders because the modal closes synchronously on select) — confirmed, non-blocking. S3 `list` sorts newest-first only within the first `ListObjectsV2` page (no pagination) — confirmed, acceptable for a 500-cap read-only library.

**Verdict**: APPROVED

## High-level view

The storage port stays symmetric: both adapters implement the same `list` returning `{ items: MediaItem[] }`, and the degrade-to-empty contract is honored where it matters — S3 catches every throw and returns `{ items: [] }`, so a missing `s3:ListBucket` permission never breaks the admin UI, it just hides the Library tab's contents and leaves Upload working. The local adapter is the dev path and treats a missing `uploads/` dir as empty rather than throwing.

The read-only `GET /admin/media` endpoint reuses the exact `@Roles('catalogue_manager','marketing')` guard from the upload endpoint, validates the folder against the known set (unknown → list all), clamps the limit to `[1,500]`, and re-sorts newest-first. No delete/rename, so blast radius is zero.

The picker is a single component used at every call site. Selection returns one URL via `onSelect(url)`; each caller decides whether to set a field (category icon, hero/banner image) or append (product images). The primary target — category icon on the admin categories page — correctly feeds `category.imageUrl` through the existing `POST /admin/categories` body, for both the add form and the inline edit.

Content-editor coverage is achieved by wiring the picker once inside `ImageDrop`, which backs both the hero image and the banner-block image fields. Promos have no image field (emoji icon only), so there is nothing to wire there.

Test coverage is real and matches the acceptance criteria: local mapping/filter/exclusion/missing-dir, S3 success mapping + AccessDenied fallback + unconfigured bucket, and the controller's folder passthrough / unknown-folder / limit-clamp / newest-first behaviors.

<details>
<summary>Issues (2)</summary>

1. **Dead "selected" preview in modal** (non-blocking) — `mediapick__selected` is set then the modal closes synchronously in the same handler, so it never paints. Selected details are still shown via the tile grid before selection and the caller's own preview after, so the requirement is met elsewhere. Could be removed or the close deferred, but no action required.
2. **S3 newest-first is page-local** (non-blocking) — `list` sorts only the first `ListObjectsV2` page (≤1000 objects, no continuation token), so with a very large bucket the newest item might not surface. Acceptable for a read-only library capped at 500; worth a comment if the bucket is expected to exceed 1000 images.

</details>

<details>
<summary>Details</summary>

### Storage port and the degrade-to-empty contract

`StorageProvider` now carries `list(prefix?, limit?): Promise<{ items: MediaItem[] }>` alongside `put`/`getUrl`, with `MediaItem = { key, url, folder, name, size, lastModified: string | null }`. Both adapters implement it, so the DI binding in `storage.module.ts` (local vs s3 by `STORAGE_PROVIDER`) still type-checks and the controller depends only on the port.

The important behavior is the failure mode. `S3StorageProvider.list` wraps the whole `ListObjectsV2` call in try/catch, logs at `warn`, and returns `{ items: [] }` on any throw — this is the `AccessDenied` upload-only fallback the task requires, and it also covers an unconfigured bucket (`if (!this.bucket) return { items: [] }`). The storage-list spec exercises both the mapped-success path and the `AccessDenied → { items: [] }` path, plus the empty-bucket guard, so the contract is pinned by tests.

`LocalStorageProvider.list` walks `uploads/` depth-first, keeps only image extensions (`jpe?g|png|webp|gif|avif|svg`), excludes the `invoices/` folder, computes POSIX-style keys, and treats `ENOENT` on the root as an empty list. It also tolerates a file vanishing between `readdir` and `stat`. The spec covers mapping, non-image filtering, invoices exclusion, prefix scoping, and the missing-dir case.

### Read-only list endpoint

```
GET /admin/media?folder=<known>&limit=<1..500>
  @Roles('catalogue_manager','marketing')   // same guard as upload
  unknown folder  -> prefix undefined (list all)
  limit           -> clamped to [1,500], default 500
  returns { items } sorted newest-first (nulls last), sliced to cap
```

The controller re-sorts and re-slices even though the adapters already sort, which is harmless and keeps the HTTP contract self-contained. `media.controller.spec.ts` asserts folder passthrough, unknown-folder → `undefined`, limit clamp, and newest-first ordering with a null `lastModified` pushed last.

### MediaPicker and call-site wiring

The component takes `{ folder?, onSelect, onClose, title? }` and exposes a Library tab (thumbnail grid, each tile showing name, folder, `formatMediaSize`, and `formatMediaDate`, with a folder `<select>` filter and click-to-select) and an Upload tab (drag-and-drop + click via `adminUpload`, which refreshes the list and auto-selects on success). Empty and unavailable states are handled distinctly: a fetch rejection shows "listing is unavailable — switch to Upload", an empty folder shows "No images found", and Upload stays usable in both.

Wiring is additive at every site — the original `<input type=file>` / dropzone / `ImageDrop` stays and a `.mediapick__open` "Choose from library" button sits next to it:

```
categories/page.tsx   add form   -> setImageUrl   -> category.imageUrl   (primary target)
                      inline edit -> setEditImage  -> category.imageUrl
product-wizard.tsx    cat chip    -> setCatEditImage (folder=categories)
                      images      -> setImages append (folder=products)
product-editor.tsx    images      -> setImages append (folder=products)
image-drop.tsx        onChange(url) -> hero image + banner-block image in content-editor
```

The pure helpers (`formatMediaSize`, `sortMediaItems`, `formatMediaDate`) are extracted into `media-picker-utils.ts` and unit-tested, which is the right move given the web Jest runs in node env without jsdom/RTL.

</details>

<details>
<summary>Files changed (17)</summary>

- `apps/api/src/integrations/storage/storage.provider.ts` — port: `MediaItem` type + `list` method.
- `apps/api/src/integrations/storage/local-storage.provider.ts` — recursive image-only `list`, invoices excluded, missing-dir safe.
- `apps/api/src/integrations/storage/s3-storage.provider.ts` — `ListObjectsV2` `list`, degrade-to-empty on error/unconfigured bucket.
- `apps/api/src/integrations/storage/storage-list.spec.ts` — local + S3 list tests incl. AccessDenied fallback.
- `apps/api/src/modules/media/media.controller.ts` — read-only `GET /admin/media` (role-guarded, folder validate, clamp, newest-first).
- `apps/api/src/modules/media/media.controller.spec.ts` — endpoint behavior tests.
- `apps/web/src/lib/admin-api.ts` — `MediaItem` type + `adminListMedia`; `adminUpload` unchanged.
- `apps/web/src/components/media-picker.tsx` — reusable Library + Upload modal.
- `apps/web/src/components/media-picker-utils.ts` + `.test.ts` — pure size/date/sort helpers + tests.
- `apps/web/src/app/admin/categories/page.tsx` — picker beside add + inline-edit icon uploaders.
- `apps/web/src/app/admin/catalogue/product-wizard.tsx` — picker for category chip edit + product images.
- `apps/web/src/app/admin/catalogue/product-editor.tsx` — picker for product images (append).
- `apps/web/src/app/admin/settings/image-drop.tsx` — picker inside shared ImageDrop (covers hero + banner).
- `apps/web/src/app/admin/admin.css` — `.mediapick*` styles.
- `.agents/tasks/media-library-picker/plan.md`, `verification.md` — task docs.

Full diff: `git show 633624e`.

</details>
