import { Controller, Inject, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { STORAGE_PROVIDER, type StorageProvider } from '../../integrations/storage/storage.provider';
import { CUSTOMER_IMAGE_MAX_BYTES, storeCustomerImage, type UploadedFileLike } from './customer-image-upload';

/**
 * Review image upload for authenticated customers (FR-3.8). Unlike the admin
 * media endpoint, this requires only a valid customer session (no role) and
 * always stores under the `reviews/` folder. Returns the public URL to attach
 * to a review.
 */
@ApiTags('review-media')
@ApiBearerAuth()
@Controller('reviews/media')
export class ReviewMediaController {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CUSTOMER_IMAGE_MAX_BYTES } }))
  upload(@UploadedFile() file: UploadedFileLike | undefined): Promise<{ url: string; key: string }> {
    return storeCustomerImage(this.storage, file, 'reviews');
  }
}
