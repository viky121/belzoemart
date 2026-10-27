import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import {
  STORAGE_PROVIDER,
  type MediaItem,
  type StorageProvider,
} from '../../integrations/storage/storage.provider';
import { LocalStorageProvider } from '../../integrations/storage/local-storage.provider';

/** Minimal shape of a multer memory-storage file (avoids a @types/multer dep). */
interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB (phone photos are large; client also downscales)
const ALLOWED = /^image\/(jpeg|png|webp|gif|avif|svg\+xml)$/;
const FOLDERS = new Set(['products', 'banners', 'categories', 'brands', 'misc']);
const LIST_CAP = 500; // max media items returned to the admin library

/**
 * Admin media upload (FR-8, FR-10.7). Accepts an image multipart file and
 * stores it via the storage port (S3 in production, local in dev), returning
 * the public URL to save on the product/banner/category record.
 */
@ApiTags('admin-media')
@ApiBearerAuth()
@RequirePermission('media.manage', 'products.edit', 'taxonomy.edit', 'content.edit', 'mobile.edit')
@Controller('admin/media')
export class MediaController {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly local: LocalStorageProvider,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async upload(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body('folder') folder?: string,
  ): Promise<{ url: string; key: string }> {
    if (!file) throw new BadRequestException('No file uploaded (field name must be "file")');
    if (!ALLOWED.test(file.mimetype)) {
      throw new BadRequestException('Only image files are allowed (jpeg, png, webp, gif, avif, svg)');
    }
    if (file.size > MAX_BYTES) throw new BadRequestException('File too large (max 15 MB)');

    const dir = FOLDERS.has(folder ?? '') ? folder! : 'misc';
    const ext = (file.originalname.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${dir}/${randomUUID()}.${ext || 'bin'}`;

    const { url } = await this.storage.put({ key, body: file.buffer, contentType: file.mimetype });
    return { url, key };
  }

  /**
   * Read-only media library listing (admin). Lets an admin reuse an already
   * uploaded server image instead of re-uploading. Optionally scoped to a known
   * `folder`; results are capped at {@link LIST_CAP} and sorted newest-first.
   * Degrades to an empty list when the storage adapter cannot list (e.g. S3
   * without s3:ListBucket), so the picker falls back to upload-only.
   */
  @Get()
  async list(
    @Query('folder') folder?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: MediaItem[] }> {
    const prefix = FOLDERS.has(folder ?? '') ? folder : undefined;
    const parsed = Number.parseInt(limit ?? '', 10);
    const cap = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), LIST_CAP) : LIST_CAP;

    // Always include files physically present on the box (served at
    // /api/uploads). When the active provider is a different adapter (S3), merge
    // its objects in too. De-duplicate by key so a file in both places appears
    // once. This keeps already-uploaded server images reusable even when S3
    // listing is unavailable (no s3:ListBucket).
    const sources = [this.local.list(prefix, cap)];
    if (this.storage !== this.local) sources.push(this.storage.list(prefix, cap));
    const results = await Promise.all(sources);

    const byKey = new Map<string, MediaItem>();
    for (const r of results) {
      for (const it of r.items) if (!byKey.has(it.key)) byKey.set(it.key, it);
    }
    const sorted = [...byKey.values()].sort((a, b) =>
      (b.lastModified ?? '').localeCompare(a.lastModified ?? ''),
    );
    return { items: sorted.slice(0, cap) };
  }
}
