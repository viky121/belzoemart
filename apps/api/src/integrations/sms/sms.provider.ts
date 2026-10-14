/**
 * SMS provider port. Concrete adapters (mock now, a DLT-approved gateway later)
 * are selected by the SMS_PROVIDER env var. All outbound SMS goes through this
 * interface so the sender can be swapped without touching domain code.
 */
export interface SmsMessage {
  to: string; // E.164 or 10-digit Indian mobile
  body: string;
  /** DLT template id (required by Indian regulations for live sending). */
  templateId?: string;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<{ messageId: string }>;
}

/** DI token for the SMS provider port. */
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
