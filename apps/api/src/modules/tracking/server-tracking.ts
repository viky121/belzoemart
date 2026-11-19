import { sanitizeTracking, type TrackingConfig } from '@belzo/shared';

/** Settings key holding the server-side tracking secrets (stored encrypted, never returned by any endpoint). */
export const SERVER_TRACKING_KEY = 'tracking.server';

/** What is stored under {@link SERVER_TRACKING_KEY}: ciphertext for the secrets, plain text for the rest. */
export interface StoredServerTracking {
  /** Google Analytics 4 Measurement Protocol API secret (encrypted). */
  ga4ApiSecretEnc?: string;
  /** Meta Conversions API access token (encrypted). */
  metaAccessTokenEnc?: string;
  /** Meta "Test events" code. While set, events appear only in Meta's Test events tab, not in live reports. */
  metaTestEventCode?: string;
  updatedAt?: string;
}

export interface ServerTrackingReady {
  ga4: boolean;
  meta: boolean;
}

function asStored(raw: unknown): StoredServerTracking {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as StoredServerTracking) : {};
}

/**
 * Which channels can receive events from the mobile app: the ID (Admin → Settings → Tracking) AND the
 * matching server-side secret must both be set. Pure, so the public settings can use it without the secrets.
 */
export function serverTrackingReady(publicConfig: TrackingConfig, storedRaw: unknown): ServerTrackingReady {
  const stored = asStored(storedRaw);
  const pub = sanitizeTracking(publicConfig);
  return {
    ga4: Boolean(pub.ga4Id && stored.ga4ApiSecretEnc),
    meta: Boolean(pub.metaPixelId && stored.metaAccessTokenEnc),
  };
}

/** True when the app should bother sending events at all. */
export function appTrackingEnabled(ready: ServerTrackingReady): boolean {
  return ready.ga4 || ready.meta;
}
