import { Global, Module } from '@nestjs/common';
import type { Env } from '../../common/config/env.schema';
import { Fast2SmsProvider } from './fast2sms.provider';
import { MockSmsProvider } from './mock-sms.provider';
import { SmsCredentials } from './sms-credentials';
import { SMS_PROVIDER } from './sms.provider';

/**
 * Binds the SMS provider port to an adapter based on SMS_PROVIDER:
 * "mock" logs messages (dev/demo), "live" sends through Fast2SMS. The env schema refuses to boot
 * with SMS_PROVIDER=live while the Fast2SMS settings are missing. The adapter reads its key and
 * route from SmsCredentials on every send, so a super admin can change them from the admin panel
 * without a restart.
 */
@Global()
@Module({
  providers: [
    SmsCredentials,
    {
      provide: SMS_PROVIDER,
      inject: ['ENV', SmsCredentials],
      useFactory: (env: Env, creds: SmsCredentials) =>
        env.SMS_PROVIDER === 'live' ? new Fast2SmsProvider(() => creds.get()) : new MockSmsProvider(),
    },
  ],
  exports: [SMS_PROVIDER, SmsCredentials],
})
export class SmsModule {}
