/** Named BullMQ queues used across the platform. */
export const QUEUES = {
  NOTIFICATIONS: 'notifications',
  INVOICES: 'invoices',
  SHIPMENTS: 'shipments',
  PAYMENTS: 'payments',
  ABANDONED_CART: 'abandoned-cart',
  /** DPDP export/deletion jobs, consumed only by DpdpWorker. */
  DPDP: 'dpdp',
  /** In-house delivery (U8): timeouts, OTP clean-up, partner presence, order-cancelled hook. */
  DELIVERY: 'delivery',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Default job options: retries with exponential backoff (RESILIENCY-10). */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};
