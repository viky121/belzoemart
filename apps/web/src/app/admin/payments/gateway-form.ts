export interface GatewayForm {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export interface CredentialsPayload {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
}

export const EMPTY_FORM: GatewayForm = { keyId: '', keySecret: '', webhookSecret: '' };

/**
 * What to send to the server: only the fields the admin actually typed, so a blank
 * field means "keep what is saved". Returns an error message when the form can't be saved.
 */
export function buildCredentialsPayload(f: GatewayForm): { payload: CredentialsPayload } | { error: string } {
  const keyId = f.keyId.trim();
  const keySecret = f.keySecret.trim();
  const webhookSecret = f.webhookSecret.trim();

  if (!keyId && !keySecret && !webhookSecret) return { error: 'Enter at least one value to save.' };
  if (!!keyId !== !!keySecret) return { error: 'Enter the Key ID and the Key secret together.' };
  if (keyId && !/^rzp_(live|test)_[A-Za-z0-9]{6,}$/.test(keyId)) {
    return { error: 'Key ID should look like rzp_live_xxxxxxxx (copy it from the Razorpay dashboard).' };
  }
  if (keySecret && keySecret.length < 10) return { error: 'The Key secret looks too short.' };
  if (webhookSecret && webhookSecret.length < 8) return { error: 'The webhook secret must be at least 8 characters.' };

  return {
    payload: {
      ...(keyId ? { keyId } : {}),
      ...(keySecret ? { keySecret } : {}),
      ...(webhookSecret ? { webhookSecret } : {}),
    },
  };
}

/** A random webhook secret (48 hex characters) made in the browser. */
export function generateWebhookSecret(bytes = 24): string {
  const a = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when saving this form would switch between test and live keys' mode (worth a confirm). */
export function changesKeyMode(currentKeyType: 'live' | 'test' | 'none', keyId: string): boolean {
  const next = keyId.startsWith('rzp_live_') ? 'live' : keyId.startsWith('rzp_test_') ? 'test' : 'none';
  return keyId !== '' && next !== currentKeyType;
}
