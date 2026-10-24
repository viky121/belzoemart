import { Body, Controller, Inject, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { STORAGE_PROVIDER, type StorageProvider } from '../../integrations/storage/storage.provider';
import { createZodDto } from '../identity/zod-dto';
import {
  CUSTOMER_IMAGE_MAX_BYTES,
  decodeBase64Image,
  storeCustomerImage,
  type UploadedFileLike,
} from './customer-image-upload';

/** Storage folder for customer profile photos (`profile/<uuid>.<ext>`). */
export const PROFILE_MEDIA_FOLDER = 'profile';

const base64PhotoSchema = z.object({
  /** The picture as base64 text (about 1.33 bytes of text per byte of picture). */
  image: z.string().min(100).max(1_000_000),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
});
class ProfilePhotoBase64Dto extends createZodDto(base64PhotoSchema) {}

/**
 * Profile photo upload for authenticated customers. Same limits as the review and return photo
 * uploads. The app then saves the returned URL with PATCH /me { photoUrl }.
 *
 * Two ways in: a multipart file (`POST /me/photo/upload`) and the picture as base64 text in a normal JSON
 * request (`POST /me/photo`). The phone app uses the second because file uploads through the phone's
 * network layer can fail with "network request failed" on some Android devices; plain JSON does not.
 */
@ApiTags('profile-media')
@ApiBearerAuth()
@Controller('me/photo')
export class ProfileMediaController {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CUSTOMER_IMAGE_MAX_BYTES } }))
  upload(@UploadedFile() file: UploadedFileLike | undefined): Promise<{ url: string; key: string }> {
    return storeCustomerImage(this.storage, file, PROFILE_MEDIA_FOLDER);
  }

  @Post()
  async uploadBase64(@Body() dto: ProfilePhotoBase64Dto): Promise<{ url: string; key: string }> {
    return storeCustomerImage(this.storage, decodeBase64Image(dto.image, dto.mimeType), PROFILE_MEDIA_FOLDER);
  }
}
