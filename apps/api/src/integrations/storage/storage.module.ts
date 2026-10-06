import { Global, Module } from '@nestjs/common';
import { STORAGE_PROVIDER } from './storage.provider';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';

/**
 * Binds the storage port to an adapter based on STORAGE_PROVIDER (local | s3).
 */
@Global()
@Module({
  providers: [
    LocalStorageProvider,
    S3StorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [LocalStorageProvider, S3StorageProvider],
      useFactory: (local: LocalStorageProvider, s3: S3StorageProvider) =>
        process.env.STORAGE_PROVIDER === 's3' ? s3 : local,
    },
  ],
  // Export LocalStorageProvider too so the media library can always surface
  // files physically present on the box (served at /api/uploads), even when the
  // active provider is S3 and can't list (e.g. no s3:ListBucket permission).
  exports: [STORAGE_PROVIDER, LocalStorageProvider],
})
export class StorageModule {}
