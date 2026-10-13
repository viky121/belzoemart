import { readString, STORAGE_KEYS, writeString } from '@/lib/storage';

/** AsyncStorage `belzo.onboarding.v1 = "done"` once the user finished or skipped onboarding. */
export async function readOnboardingDone(): Promise<boolean> {
  return (await readString(STORAGE_KEYS.onboarding)) === 'done';
}

export async function markOnboardingDone(): Promise<void> {
  await writeString(STORAGE_KEYS.onboarding, 'done');
}
