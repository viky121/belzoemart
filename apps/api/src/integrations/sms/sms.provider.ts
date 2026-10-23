/**
 * SMS provider port. Concrete adapters (mock now, a DLT-approved gateway later)
 * are selected by the SMS_PROVIDER env var. All outbound SMS goes through this
 * interface so the sender can be swapped without touching domain code.
 */
/** Reasons an OTP SMS is sent. Each can have its own approved template. */
export type SmsPurpose = 'register' | 'reset' | 'login' | 'delivery';

export interface SmsMessage {
  to: string; // E.164 or 10-digit Indian mobile
  body: string;
  /** DLT template id (required by Indian regulations for live sending). */
  templateId?: string;
  /**
   * Set when the message is a one-time code. Gateways with a dedicated OTP route
   * (Fast2SMS) send just this code with their own approved wording; other
   * adapters can ignore it and send `body`.
   */
  otp?: string;
  /** What the code is for. Lets a gateway pick the matching approved template (register / reset / delivery). */
  purpose?: SmsPurpose;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<{ messageId: string }>;
}

/** DI token for the SMS provider port. */
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
