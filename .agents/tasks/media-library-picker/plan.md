# Implementation Plan — Admin Media Library + reusable Image Picker

## Goal

Let admins pick an **already-uploaded server image** (with its details) OR upload a new one, wherever an image/icon is set — primarily **category icons**, and also product images and home-content images. Additive and backward compatible: existing direct uploads keep working; image URLs are still stored on records exactly as today.

## Context discovered during exploration (ground truth)

- **Storage port**: `apps/api/src/integrations/storage/storage.provider.ts` — `interface StorageProvider { put, getUrl }`, plus `STORAGE_PROVIDER` symbol. Two adapters, selected in `storage.module.ts` by `process.env.STORAGE_PROVIDER === 's3'`:
  - `local-storage.provider.ts` — writes `<cwd>/uploads/<key>`; `getUrl(key)` → `${CDN_BASE_URL|PUBLIC_BASE_URL}/api/uploads/<key>`. Served statically in `main.ts` via `app.useStaticAssets(join(process.cwd(),'uploads'),{prefix:'/api/uploads'})`.
  - `s3-storage.provider.ts` — uploads via `PutObjectCommand`; `getUrl(key)` → CDN or S3 virtual-hosted URL. Already imports from `@aws-sdk/client-s3` (dependency present). PROD runs `STORAGE_PROVIDER=s3`.
- **Upload endpoint**: `apps/api/src/modules/media/media.controller.ts` — `POST /admin/media/upload` (`@Roles('catalogue_manager','marketing')`, field `file`, optional body `folder`). Known folders set: `products, banners, categories, brands, misc`. Returns `{ url, key }`. There is **no list endpoint** — that is the core gap.
- `apps/api/src/modules/media/media.module.ts` declares `MediaController` + `ReviewMediaController`. Storage port is global (`StorageModule`).
- **Frontend API**: `apps/web/src/lib/admin-api.ts` — `adminFetch<T>(path, opts)` (auto token-refresh) and `adminUpload(file, folder)` (compresses, POSTs multipart). `apps/web/src/lib/api-client.ts` prefixes `/api/v1`.
- **Image fields today** (raw `<input type=file>` + `adminUpload`, or `ImageDrop`):
  - Category icon — admin categories page `apps/web/src/app/admin/categories/page.tsx` (add form `uploadImg`→`imageUrl`; inline edit `uploadEditImg`→`editImage`) AND product wizard inline chip edit in `apps/web/src/app/admin/catalogue/product-wizard.tsx` (`uploadCatEditImg`→`catEditImage`). Saved as `category.imageUrl` via `POST /admin/categories { id,name,parentId,imageUrl }`.
  - Product images — `product-wizard.tsx` dropzone (`uploadFiles`→appends to `images[]`) and `apps/web/src/app/admin/catalogue/product-editor.tsx` (`handleFiles`→appends to `images[]`).
  - Home-content images — `apps/web/src/app/admin/settings/content-editor.tsx` via the shared `apps/web/src/app/admin/settings/image-drop.tsx` `<ImageDrop>` (hero image + banner-block image; folder `banners`). Promos have no image field.
- **Modal pattern** to reuse: `.pm-modal` / `.pm-modal__card` / `.pm-modal__actions` defined in `apps/web/src/app/admin/admin.css` (used by `UpdateStockModal` in `apps/web/src/app/admin/catalogue/page.tsx`). `isUsableImageUrl` lives in `apps/web/src/lib/category-theme.ts`.
- **Build/test**: pnpm monorepo. API = NestJS + Jest (`jest.config.js`, `testMatch **/*.spec.ts`, node env). Web = Next 14 + Jest (`testMatch **/*.test.ts`, node env — **no jsdom/RTL**, so React render tests are not available; verify web via typecheck/lint/build + pure-logic unit tests only).
- No `uploads/` dir exists locally right now — `LocalStorageProvider.list` must treat a missing dir as empty.

## Design decisions (made here, not deferred)

1. **Port shape**: add `list(prefix?, limit?)` returning `{ items: MediaItem[] }` where `MediaItem = { key; url; folder; name; size; lastModified: string | null }`. One method on the port keeps both adapters symmetric and the controller thin.
2. **Degrade, don't error**: S3 `list` catches any throw (e.g. `AccessDenied` when the IAM role lacks `s3:ListBucket`) and returns `{ items: [] }`. The picker then shows the Upload tab + a note. This matches the task's "upload-only fallback" requirement and avoids a hard dependency on a new IAM permission.
3. **Read-only endpoint**: `GET /admin/media?folder=&limit=` with the same `@Roles`. Cap at 500, newest first (sort by `lastModified` desc, nulls last). No deletion (keeps blast radius zero; task says keep it read-only).
4. **One reusable component** `MediaPicker` with Library + Upload tabs, used at every site. Selecting returns a single URL via `onSelect(url)`; the caller decides whether to set a field or append to a list, then closes. This keeps the component agnostic.
5. **Content-editor wiring is done once inside `ImageDrop`** (not per-field in content-editor), because `ImageDrop` is the shared uploader behind both the hero image and banner-block image fields. One change covers both.
6. **Testable web logic is extracted**: a pure `formatMediaSize(bytes)` + `sortMediaItems(items)` helper module so there is a real web unit test (`.test.ts`, node env) rather than relying on unavailable render tests.

---

# Implementation steps

- [x] 1. **Extend the storage port with `list`.**
      Add `MediaItem` interface (`key, url, folder, name, size, lastModified: string | null`) and `list(prefix?: string, limit?: number): Promise<{ items: MediaItem[] }>` to the `StorageProvider` interface. Export `MediaItem`.
      Files: `apps/api/src/integrations/storage/storage.provider.ts`
      Verify: `pnpm --filter @belzo/api typecheck` — fails on the two providers not implementing `list` yet (expected; fixed in steps 2–3). Compilation of this file alone must have no syntax errors.

- [x] 2. **Implement `LocalStorageProvider.list`.**
      Recursively walk `this.root` (`<cwd>/uploads`) with `node:fs/promises` `readdir(..., { withFileTypes: true })`. For each file: compute `key` = POSIX-style path relative to root (replace `\\` with `/`), `folder` = first path segment, `name` = basename, `size`/`lastModified` from `stat` (mtime `.toISOString()`), `url` = `this.getUrl(key)`. Keep only image extensions `jpg|jpeg|png|webp|gif|avif|svg`; skip the `invoices/` folder. If the root dir is missing (`ENOENT`), return `{ items: [] }`. If `prefix` is given, only descend into / keep keys under it. Respect `limit` (default large, e.g. 1000) after sorting newest-first by mtime.
      Files: `apps/api/src/integrations/storage/local-storage.provider.ts`
      Verify: `pnpm --filter @belzo/api test -- storage` runs the new spec from step 4 (local cases) and passes.

- [x] 3. **Implement `S3StorageProvider.list`.**
      Import `ListObjectsV2Command` from `@aws-sdk/client-s3`. Call `this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: Math.min(limit ?? 1000, 1000) }))`. Map each returned object (`Contents`) to a `MediaItem`: `key = obj.Key`, `url = this.getUrl(obj.Key)`, `folder` = first segment of key, `name` = basename, `size = obj.Size ?? 0`, `lastModified = obj.LastModified?.toISOString() ?? null`. Filter to image extensions and exclude `invoices/`, same as local. Wrap the whole thing in `try/catch`; on any error log at `warn` and return `{ items: [] }`. If `this.bucket` is empty, return `{ items: [] }`.
      Files: `apps/api/src/integrations/storage/s3-storage.provider.ts`
      Verify: `pnpm --filter @belzo/api test -- storage` — new S3 spec cases (success mapping + AccessDenied→empty) pass.

- [x] 4. **Add storage-provider unit tests.**
      New spec covering: LocalStorageProvider.list on a temp dir (create a few files incl. a non-image and an `invoices/` file, assert mapping/filtering/sorting and that a missing dir yields `[]`); S3StorageProvider.list with a mocked `S3Client.send` (success → mapped items; thrown `AccessDenied` → `{ items: [] }`). Mock the AWS client by stubbing the private `s3` getter or injecting via `(provider as any).client = { send: jest.fn() }`.
      Files: `apps/api/src/integrations/storage/storage-list.spec.ts`
      Verify: `pnpm --filter @belzo/api test -- storage` — all new cases pass.

- [x] 5. **Add the read-only list endpoint.**
      In `media.controller.ts` add `@Get()` handler `list(@Query('folder') folder?, @Query('limit') limit?)` under the existing `@Roles('catalogue_manager','marketing')` + `@Controller('admin/media')`. Validate `folder` against the known `FOLDERS` set (ignore unknown → list all). Parse `limit` to a number, clamp to `[1, 500]`, default 500. Call `this.storage.list(folder, limit)`, sort items newest-first (`lastModified` desc, nulls last), slice to the cap, return `{ items }`. Import `Get`, `Query` from `@nestjs/common`.
      Files: `apps/api/src/modules/media/media.controller.ts`
      Verify: `pnpm --filter @belzo/api build` compiles. Add/extend a `media.controller.spec.ts` with a fake `StorageProvider` returning items, asserting the handler caps, sorts newest-first, and passes the folder through; `pnpm --filter @belzo/api test -- media` passes.

- [x] 6. **Add `adminFetch`-based media list helper + API doc.**
      In `admin-api.ts` export `MediaItem` type (mirror the API shape) and `adminListMedia(folder?: string): Promise<{ items: MediaItem[] }>` using `adminFetch` to `GET /admin/media?folder=<folder>`. Add a short JSDoc. (Keep `adminUpload` unchanged.)
      Files: `apps/web/src/lib/admin-api.ts`
      Verify: `pnpm --filter @belzo/web typecheck` passes.

- [x] 7. **Add testable media helpers (pure functions).**
      Create `formatMediaSize(bytes: number): string` (e.g. `"12.3 KB"` / `"1.2 MB"`) and `sortMediaItems(items: MediaItem[]): MediaItem[]` (newest-first, nulls last) in a small module the picker imports. Keeping them pure makes them unit-testable in the node-env web jest.
      Files: `apps/web/src/components/media-picker-utils.ts`, `apps/web/src/components/media-picker-utils.test.ts`
      Verify: `pnpm --filter @belzo/web test -- media-picker-utils` passes.

- [x] 8. **Create the reusable `<MediaPicker>` modal.**
      Props: `{ folder?: 'products'|'banners'|'categories'|'brands'|'misc'; onSelect: (url: string) => void; onClose: () => void; title?: string }`. Two tabs:
      (a) **Library** — on open and on folder-filter change, `adminListMedia(folder)`; render a thumbnail grid, each tile showing the image + details (`name`, `folder`, `formatMediaSize(size)`, upload date from `lastModified`); a folder `<select>` filter; click a tile → `onSelect(url)` then `onClose()`. Show a selected preview + name before closing. If the list is empty or the fetch returns no items, show a note ("No images found / listing unavailable — upload a new one") and keep Upload usable.
      (b) **Upload** — reuse the `ImageDrop`-style drag-and-drop + click (call `adminUpload(file, folder ?? 'misc')`); on success, refresh the library list and auto-`onSelect` the new URL (then close). Surface upload errors inline.
      Use the existing modal classes (`pm-modal`, `pm-modal__card`, `pm-modal__actions`) with `role="dialog" aria-modal="true"`, an Escape/`onClose` handler, and `data-testid="media-picker"`. Add grid/tab styles under a `.mediapick*` namespace in `admin.css`.
      Files: `apps/web/src/components/media-picker.tsx`, `apps/web/src/app/admin/admin.css`
      Verify: `pnpm --filter @belzo/web typecheck` and `pnpm --filter @belzo/web lint` pass.

- [x] 9. **Wire the picker into the admin categories page** (primary target).
      In `categories/page.tsx` add a "Choose from library" button next to BOTH the add-form file input (sets `imageUrl`) and the inline-edit file input (sets `editImage`); keep the existing `<input type=file>` uploaders. Render `<MediaPicker folder="categories" .../>` when open, wiring `onSelect` to the matching setter and showing the selected preview (already rendered via existing `<img>`). Use two small boolean states (e.g. `pickFor: 'add' | 'edit' | null`).
      Files: `apps/web/src/app/admin/categories/page.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` + `pnpm --filter @belzo/web lint` pass; `pnpm --filter @belzo/web build` succeeds.

- [x] 10. **Wire the picker into the product-wizard category chip edit AND product images.**
      In `product-wizard.tsx`: (a) in `renderCatChip` inline edit, add a "Choose from library" button next to the file input, opening `<MediaPicker folder="categories">` with `onSelect` → `setCatEditImage(url)`; (b) in the Step‑2 Product Images card, add a "Choose from library" button near the dropzone opening `<MediaPicker folder="products">` with `onSelect` → `setImages((cur)=>[...cur,url])` (append, matching existing upload behavior). Keep the dropzone untouched. Add a `pickerMode` state to track which picker is open.
      Files: `apps/web/src/app/admin/catalogue/product-wizard.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` + `pnpm --filter @belzo/web lint` pass.

- [x] 11. **Wire the picker into the product-editor images.**
      In `product-editor.tsx` add a "Choose from library" button next to the images `<input type=file>`, opening `<MediaPicker folder="products">` with `onSelect` → `setImages((cur)=>[...cur,url])` (append). Keep the existing uploader.
      Files: `apps/web/src/app/admin/catalogue/product-editor.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` + `pnpm --filter @belzo/web lint` pass.

- [x] 12. **Wire the picker into `ImageDrop` (covers content-editor hero + banner images).**
      In `image-drop.tsx` add a small "Choose from library" button below the drop area; open `<MediaPicker folder="banners">` and on `onSelect(url)` call the existing `onChange(url)`. This makes the picker available for every `ImageDrop` consumer (hero image and banner blocks in `content-editor.tsx`) with no change to `content-editor.tsx`. Keep drag-and-drop + the "paste URL" input working.
      Files: `apps/web/src/app/admin/settings/image-drop.tsx`
      Verify: `pnpm --filter @belzo/web typecheck` + `pnpm --filter @belzo/web lint` pass.

- [x] 13. **Full build + regression gate.**
      Run the whole suite to confirm nothing regressed (home-sections, home-content CMS, bulk upload, pincode/profile, categories).
      Files: (none)
      Verify (run all, all must pass):
      - `pnpm --filter @belzo/api typecheck`
      - `pnpm --filter @belzo/api test`
      - `pnpm --filter @belzo/api build`
      - `pnpm --filter @belzo/web typecheck`
      - `pnpm --filter @belzo/web lint`
      - `pnpm --filter @belzo/web test`
      - `pnpm --filter @belzo/web build`

## Out of scope / explicit non-goals

- No DB record of uploads (listing is derived live from storage).
- No delete/rename of media (endpoint is read-only).
- No change to how image URLs are persisted on category/product/settings records.
- No change to the existing `POST /admin/media/upload` or `adminUpload` behavior.

## Manual smoke (optional, requires running stack)

With API + web running: open Admin → Categories → "Choose from library" on a category → the Library tab lists existing `categories/*` images with name/size/date → pick one → it becomes `imageUrl` → Save → category row shows the icon. Upload tab uploads a new icon and auto-selects it.

