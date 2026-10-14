import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  EmailMessage,
  EmailProvider,
  PushMessage,
  PushProvider,
  WhatsAppMessage,
  WhatsAppProvider,
} from './channels';

/** Mock email/WhatsApp/push adapters — log instead of sending (local/dev). */
@Injectable()
export class MockEmailProvider implements EmailProvider {
  private readonly logger = new Logger('MockEmailProvider');
  async send(msg: EmailMessage): Promise<{ messageId: string }> {
    const messageId = randomUUID();
    // Log the body too (dev only) so OTP codes are retrievable from API logs.
    this.logger.log(
      `[MOCK EMAIL] to=${msg.to} subject="${msg.subject}" id=${messageId} body="${msg.html}"`,
    );
    return { messageId };
  }
}

@Injectable()
export class MockWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger('MockWhatsAppProvider');
  async send(msg: WhatsAppMessage): Promise<{ messageId: string }> {
    const messageId = randomUUID();
    this.logger.log(`[MOCK WHATSAPP] to=${msg.to} template=${msg.template} id=${messageId}`);
    return { messageId };
  }
}

@Injectable()
export class MockPushProvider implements PushProvider {
  private readonly logger = new Logger('MockPushProvider');
  async send(msg: PushMessage): Promise<{ messageId: string }> {
    const messageId = randomUUID();
    this.logger.log(`[MOCK PUSH] customer=${msg.customerId} title="${msg.title}" id=${messageId}`);
    return { messageId };
  }
}
