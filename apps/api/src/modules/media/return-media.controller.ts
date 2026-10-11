import { Controller, Inject, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { STORAGE_PROVIDER, type StorageProvider } from '../../integrations/storage/storage.provider';
import { RETURN_MEDIA_FOLDER } from '../orders/return-images';
import { CUSTOMER_IMAGE_MAX_BYTES, storeCustomerImage, type UploadedFileLike } from './customer-image-upload';

/**
 * Return/replacement photo upload for authenticated customers. Same limits as
 * review uploads; always stores under `returns/` so ReturnService can accept
 * only URLs produced here.
 */
@ApiTags('return-media')
@ApiBearerAuth()
@Controller('orders/returns/media')
export class ReturnMediaController {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CUSTOMER_IMAGE_MAX_BYTES } }))
  upload(@UploadedFile() file: UploadedFileLike | undefined): Promise<{ url: string; key: string }> {
    return storeCustomerImage(this.storage, file, RETURN_MEDIA_FOLDER);
  }
}
