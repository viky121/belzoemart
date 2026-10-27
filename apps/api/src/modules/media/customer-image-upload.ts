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

/** Pictures sent as text (base64) inside a normal JSON request. */
export const BASE64_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type Base64ImageType = keyof typeof BASE64_IMAGE_TYPES;

/** Biggest picture accepted this way (the JSON body limit is 1 MB, so this is well inside it). */
export const BASE64_IMAGE_MAX_BYTES = 750 * 1024;

/** The first bytes of each format, so a file cannot pass as a picture just by saying so. */
function looksLike(type: Base64ImageType, b: Buffer): boolean {
  if (type === 'image/jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b.length > 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG';
  return b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
}

/**
 * Turns a base64 picture into a file-like object, after checking it really is that kind of picture and is
 * not too big. A data URL prefix ("data:image/jpeg;base64,") is tolerated.
 */
export function decodeBase64Image(image: string, mimeType: Base64ImageType): UploadedFileLike {
  const raw = image.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new BadRequestException('The picture is not valid base64.');
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length === 0) throw new BadRequestException('The picture is empty.');
  if (buffer.length > BASE64_IMAGE_MAX_BYTES) {
    throw new BadRequestException('The picture is too large. Please choose a smaller one.');
  }
  if (!looksLike(mimeType, buffer)) throw new BadRequestException('The file is not a valid picture of that type.');
  return { buffer, mimetype: mimeType, originalname: `photo.${BASE64_IMAGE_TYPES[mimeType]}`, size: buffer.length };
}
