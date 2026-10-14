import { Global, Module } from '@nestjs/common';
import { SMS_PROVIDER } from './sms.provider';
import { MockSmsProvider } from './mock-sms.provider';

/**
 * Binds the SMS provider port to an adapter based on SMS_PROVIDER.
 * Only the mock adapter ships in Phase 1; a live DLT-approved adapter is added
 * at deploy time and selected via env without touching callers.
 */
@Global()
@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      useClass: MockSmsProvider,
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
