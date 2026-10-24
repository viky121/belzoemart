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
  /** Signs delivery-partner tokens. Must differ from the other secrets so a partner token never passes customer or admin routes (SECURITY-08). */
  JWT_PARTNER_SECRET: z.string().min(32, 'JWT_PARTNER_SECRET must be at least 32 characters'),
  /** Pepper for the delivery OTP hash. Changing it only invalidates codes in flight. */
  DELIVERY_OTP_PEPPER: z.string().min(32, 'DELIVERY_OTP_PEPPER must be at least 32 characters'),
  /** Partner refresh-token lifetime in seconds (default 7 days). */
  PARTNER_REFRESH_TTL: z.coerce.number().int().positive().default(604_800),
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
  // Fast2SMS (used when SMS_PROVIDER=live). Key: Fast2SMS dashboard > Dev API.
  FAST2SMS_API_KEY: z.string().optional().default(''),
  /** "otp" = Fast2SMS OTP route ("Your OTP: 123456", no DLT needed); "dlt" = your DLT-approved template. */
  FAST2SMS_ROUTE: z.enum(['otp', 'dlt', 'smart']).default('otp'),
  /** Smart OTP route only: the "OTP ID" of the template linked under Fast2SMS > Smart OTP. */
  FAST2SMS_OTP_ID: z.string().optional().default(''),
  /** Smart OTP route: a template per purpose (registration / password reset / delivery). Each falls back to FAST2SMS_OTP_ID. */
  FAST2SMS_OTP_ID_REGISTER: z.string().optional().default(''),
  FAST2SMS_OTP_ID_RESET: z.string().optional().default(''),
  FAST2SMS_OTP_ID_DELIVERY: z.string().optional().default(''),
  /** DLT route only: approved 3-6 letter sender id and the approved OTP template's message id. */
  FAST2SMS_SENDER_ID: z.string().optional().default(''),
  FAST2SMS_DLT_MESSAGE_ID: z.string().optional().default(''),
  WHATSAPP_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  EMAIL_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),

  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  /** Public origin of the site. Payment callbacks and hosted-checkout links are built from it (https for live). */
  PUBLIC_BASE_URL: z.string().optional().default(''),

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
  /** Display name customers see as the sender ("Belzo eMart <address>"). Empty = bare address. */
  EMAIL_FROM_NAME: z.string().optional().default('Belzo eMart'),

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
  // The partner realm must have its own signing secret (SECURITY-08, SECURITY-12).
  if (env.JWT_PARTNER_SECRET === env.JWT_ACCESS_SECRET || env.JWT_PARTNER_SECRET === env.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_PARTNER_SECRET'],
      message: 'JWT_PARTNER_SECRET must be different from JWT_ACCESS_SECRET and JWT_REFRESH_SECRET',
    });
  }
  // Fail fast if live SMS is selected but Fast2SMS is not configured (SECURITY-09).
  if (env.SMS_PROVIDER === 'live') {
    const need: (keyof typeof env)[] = ['FAST2SMS_API_KEY'];
    if (env.FAST2SMS_ROUTE === 'dlt') need.push('FAST2SMS_SENDER_ID', 'FAST2SMS_DLT_MESSAGE_ID');
    // Smart OTP needs a template for registration and one for password reset (or one general template).
    if (env.FAST2SMS_ROUTE === 'smart') {
      if (!env.FAST2SMS_OTP_ID && !env.FAST2SMS_OTP_ID_REGISTER) need.push('FAST2SMS_OTP_ID');
      if (!env.FAST2SMS_OTP_ID && !env.FAST2SMS_OTP_ID_RESET) need.push('FAST2SMS_OTP_ID_RESET');
    }
    for (const key of need) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when SMS_PROVIDER=live (FAST2SMS_ROUTE=${env.FAST2SMS_ROUTE})`,
        });
      }
    }
  }
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
    if (env.RAZORPAY_KEY_ID && !env.RAZORPAY_KEY_ID.startsWith('rzp_')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RAZORPAY_KEY_ID'],
        message: 'RAZORPAY_KEY_ID must be a Razorpay key id (starts with rzp_live_ or rzp_test_)',
      });
    }
    // Razorpay live calls back only to https, and the hosted mobile checkout builds its links from this.
    if (env.NODE_ENV === 'production' && !env.PUBLIC_BASE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PUBLIC_BASE_URL'],
        message: 'PUBLIC_BASE_URL must be an https:// URL when PAYMENT_PROVIDER=live in production',
      });
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
