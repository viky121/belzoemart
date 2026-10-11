import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { ReviewMediaController } from './review-media.controller';
import { ReturnMediaController } from './return-media.controller';

/**
 * Media uploads. The storage port (STORAGE_PROVIDER) is provided globally by
 * StorageModule. Admin media (role-guarded) + customer review/return-image upload.
 */
@Module({
  controllers: [MediaController, ReviewMediaController, ReturnMediaController],
})
export class MediaModule {}
