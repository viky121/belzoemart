import { z } from 'zod';

/**
 * Environment schema. Validated at boot so the process fails fast on
 * misconfiguration (SECURITY-09, RESILIENCY-04). No secret is ever hardcoded;
 * all come from the environment / secrets manager (SECURITY-12).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(1_209_600),

  DEFAULT_LOCALE: z.enum(['en', 'hi']).default('en'),
  SUPPORTED_LOCALES: z
    .string()
    .default('en,hi')
    .transform((s) => s.split(',').map((l) => l.trim()).filter(Boolean)),

  STORE_CURRENCY: z.literal('INR').default('INR'),
  STORE_GSTIN: z.string().optional().default(''),

  PAYMENT_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  SHIPPING_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  SMS_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  WHATSAPP_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  EMAIL_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),

  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  // SMTP email (used when EMAIL_PROVIDER=live). Works with Gmail (App Password).
  SMTP_HOST: z.string().optional().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(465),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v ? v === 'true' : undefined)),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().optional().default(''),

  // Object storage (used when STORAGE_PROVIDER=s3).
  S3_REGION: z.string().optional().default('ap-south-1'),
  S3_BUCKET: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  CDN_BASE_URL: z.string().optional().default(''),

  SHIPROCKET_EMAIL: z.string().optional().default(''),
  SHIPROCKET_PASSWORD: z.string().optional().default(''),

  SENTRY_DSN: z.string().optional().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
}).superRefine((env, ctx) => {
  // Fail fast if Razorpay is selected but credentials are missing (SECURITY-09).
  if (env.PAYMENT_PROVIDER === 'live') {
    for (const key of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when PAYMENT_PROVIDER=live`,
        });
      }
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/** Validate raw process.env into a typed, defaulted config object. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
