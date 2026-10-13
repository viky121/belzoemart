import Constants from 'expo-constants';
import { z } from 'zod';

/** Runtime shape of `expo.extra` produced by app.config.ts (design §13.1). */
export const extraSchema = z.object({
  variant: z.enum(['development', 'production']),
  apiBaseUrl: z.string().url(),
  cleartextHosts: z.array(z.string()),
  showDevOtp: z.boolean(),
  phoneOtpEnabled: z.boolean(),
  onlinePaymentEnabled: z.boolean(),
});

export type AppEnv = z.infer<typeof extraSchema>;

export type EnvResult = { ok: true; env: AppEnv } | { ok: false; error: string };

export function parseExtra(extra: unknown): EnvResult {
  const parsed = extraSchema.safeParse(extra);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join('.') || 'extra'}: ${i.message}`)
        .join('; '),
    };
  }
  const env = parsed.data;
  if (env.variant === 'production' && !env.apiBaseUrl.startsWith('https://')) {
    return { ok: false, error: 'apiBaseUrl: production requires https://' };
  }
  return { ok: true, env };
}

/** Validated once at module load. The app root renders a fatal config screen when `ok` is false. */
export const envResult: EnvResult = parseExtra(Constants.expoConfig?.extra);

const FALLBACK: AppEnv = {
  variant: 'development',
  apiBaseUrl: 'http://invalid.local',
  cleartextHosts: [],
  showDevOtp: false,
  phoneOtpEnabled: false,
  onlinePaymentEnabled: false,
};

/** Typed config. When validation failed the app never makes requests (fatal screen). */
export const env: AppEnv = envResult.ok ? envResult.env : FALLBACK;
