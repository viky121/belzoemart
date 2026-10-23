/**
 * Storage access that never throws.
 *
 * `window.localStorage` / `window.sessionStorage` can throw a `SecurityError`
 * merely on access in some browsers and configurations — Safari Private Mode on
 * older iOS, embedded in-app webviews, and any browser where cookies / site
 * data are blocked by the user or an enterprise policy. Unguarded access there
 * throws synchronously, crashing the React tree and blanking the page.
 *
 * These helpers degrade gracefully: reads return `null` and writes become
 * no-ops when storage is unavailable (including during SSR, where `window` is
 * undefined). The `getStore()` call sits inside the try so even a throwing
 * property access on `window.localStorage` is handled.
 */
function makeSafe(getStore: () => Storage) {
  return {
    get(key: string): string | null {
      try {
        return getStore().getItem(key);
      } catch {
        return null;
      }
    },
    set(key: string, value: string): void {
      try {
        getStore().setItem(key, value);
      } catch {
        /* storage unavailable — ignore */
      }
    },
    remove(key: string): void {
      try {
        getStore().removeItem(key);
      } catch {
        /* storage unavailable — ignore */
      }
    },
  };
}

export const safeLocal = makeSafe(() => window.localStorage);
export const safeSession = makeSafe(() => window.sessionStorage);
