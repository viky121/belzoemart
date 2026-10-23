/**
 * Notification channel ports (FR-6.3, FR-13.5). Email, WhatsApp, and push each
 * have an interface with a mock adapter (SMS reuses the U2 SmsProvider). Live
 * adapters (SES, WhatsApp Business API, FCM) are dropped in at deploy.
 */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}
export interface EmailProvider {
  send(msg: EmailMessage): Promise<{ messageId: string }>;
}
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface WhatsAppMessage {
  to: string;
  template: string;
  body: string;
}
export interface WhatsAppProvider {
  send(msg: WhatsAppMessage): Promise<{ messageId: string }>;
}
export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface PushMessage {
  customerId: string;
  title: string;
  body: string;
}
export interface PushProvider {
  send(msg: PushMessage): Promise<{ messageId: string }>;
}
export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
