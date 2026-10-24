import { env } from '@/config/env';

/** `app-version.json`, published next to the website (apps/web/public/app-version.json). */
export interface AppVersionInfo {
  /** Latest released app version, e.g. "0.2.0". */
  version: string;
  /** APK link (absolute, or relative to the site). Empty/missing = no download published yet. */
  apkUrl: string | null;
  /** Short "what's new" line. */
  notes: string | null;
}

const TIMEOUT_MS = 8_000;

/** Returns null on any failure: an update check must never break or slow the app. */
export async function fetchAppVersion(signal?: AbortSignal): Promise<AppVersionInfo | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(`${env.apiBaseUrl}/app-version.json`, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const raw = JSON.parse(await res.text()) as Partial<AppVersionInfo>;
    if (typeof raw.version !== 'string' || raw.version.trim() === '') return null;
    return {
      version: raw.version.trim(),
      apkUrl: typeof raw.apkUrl === 'string' && raw.apkUrl.trim() !== '' ? raw.apkUrl.trim() : null,
      notes: typeof raw.notes === 'string' && raw.notes.trim() !== '' ? raw.notes.trim() : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
