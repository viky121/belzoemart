import { Global, Module } from '@nestjs/common';
import { EMAIL_PROVIDER, PUSH_PROVIDER, WHATSAPP_PROVIDER } from './channels';
import { MockEmailProvider, MockPushProvider, MockWhatsAppProvider } from './mock-channels';
import { SmtpEmailProvider } from './smtp-email.provider';

/**
 * Binds notification channel ports to adapters. Email uses SMTP (nodemailer)
 * when EMAIL_PROVIDER=live, otherwise the mock adapter (logs only). SMS is
 * provided separately by the U2 SmsModule.
 */
@Global()
@Module({
  providers: [
    MockEmailProvider,
    SmtpEmailProvider,
    MockWhatsAppProvider,
    MockPushProvider,
    {
      provide: EMAIL_PROVIDER,
      inject: [MockEmailProvider, SmtpEmailProvider],
      useFactory: (mock: MockEmailProvider, smtp: SmtpEmailProvider) =>
        process.env.EMAIL_PROVIDER === 'live' ? smtp : mock,
    },
    { provide: WHATSAPP_PROVIDER, useClass: MockWhatsAppProvider },
    { provide: PUSH_PROVIDER, useClass: MockPushProvider },
  ],
  exports: [EMAIL_PROVIDER, WHATSAPP_PROVIDER, PUSH_PROVIDER],
})
export class NotificationsIntegrationModule {}
