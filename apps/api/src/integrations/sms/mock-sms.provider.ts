import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SmsMessage, SmsProvider } from './sms.provider';

/**
 * Development/test SMS adapter. Instead of sending a real message it logs the
 * body (so OTPs are visible in the API logs during local development). Never
 * enable in production — set SMS_PROVIDER=live with a real adapter there.
 */
@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger('MockSmsProvider');

  async send(message: SmsMessage): Promise<{ messageId: string }> {
    const messageId = randomUUID();
    this.logger.log(`[MOCK SMS] to=${message.to} id=${messageId} body="${message.body}"`);
    return { messageId };
  }
}
