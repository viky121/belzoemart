import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { StorageProvider } from '../../integrations/storage/storage.provider';

export interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export const CUSTOMER_IMAGE_MAX_BYTES = 15 * 1024 * 1024; // 15 MB (phone photos are large; client also downscales)
export const CUSTOMER_IMAGE_ALLOWED = /^image\/(jpeg|png|webp|gif|avif)$/;

/**
 * Validate a customer-uploaded image and store it as `<folder>/<uuid>.<ext>`.
 * Shared by the review and return photo upload endpoints.
 */
export async function storeCustomerImage(
  storage: StorageProvider,
  file: UploadedFileLike | undefined,
  folder: string,
): Promise<{ url: string; key: string }> {
  if (!file) throw new BadRequestException('No file uploaded (field name must be "file")');
  if (!CUSTOMER_IMAGE_ALLOWED.test(file.mimetype)) {
    throw new BadRequestException('Only image files are allowed (jpeg, png, webp, gif, avif)');
  }
  if (file.size > CUSTOMER_IMAGE_MAX_BYTES) throw new BadRequestException('File too large (max 15 MB)');

  const ext = (file.originalname.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `${folder}/${randomUUID()}.${ext || 'bin'}`;
  const { url } = await storage.put({ key, body: file.buffer, contentType: file.mimetype });
  return { url, key };
}
