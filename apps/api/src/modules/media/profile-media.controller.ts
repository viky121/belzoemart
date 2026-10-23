import { Controller, Inject, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { STORAGE_PROVIDER, type StorageProvider } from '../../integrations/storage/storage.provider';
import { CUSTOMER_IMAGE_MAX_BYTES, storeCustomerImage, type UploadedFileLike } from './customer-image-upload';

/** Storage folder for customer profile photos (`profile/<uuid>.<ext>`). */
export const PROFILE_MEDIA_FOLDER = 'profile';

/**
 * Profile photo upload for authenticated customers. Same limits as the review and return photo
 * uploads. The app then saves the returned URL with PATCH /me { photoUrl }.
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
}
