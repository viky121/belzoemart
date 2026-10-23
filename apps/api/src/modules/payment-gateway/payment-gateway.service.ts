import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GatewayCredentials } from '../../integrations/payment/gateway-credentials';
import { PaymentService, type PaymentProgress } from '../checkout/payment.service';
import { GatewaySettingsService } from './gateway-settings.service';
import { HOSTED_TOKEN_TTL_SECONDS, isAllowedReturnUrl, signHostedToken, verifyHostedToken, type HostedTokenPayload } from './hosted-token';
import { renderHostedPage } from './hosted-page';

/** How often abandoned online orders are swept, and how long a payment may stay open. */
const SWEEP_EVERY_MS = 5 * 60 * 1000;
const ABANDON_AFTER_MS = 30 * 60 * 1000;

export interface GatewayStatus {
  mode: 'live' | 'mock';
  keyType: 'live' | 'test' | 'none';
  /** Safe-to-show hint (e.g. "rzp_live_Tor…2jv"), never the secret. */
  keyHint: string;
  secretConfigured: boolean;
  webhookSecretConfigured: boolean;
  webhookUrl: string;
  /** When the gateway last called our webhook; null = never (webhook not set up in the dashboard yet). */
  lastWebhookAt: string | null;
  openOnlineOrders: number;
  /** Where each credential in use comes from: entered in the admin panel, or the server environment. */
  source: { keyId: 'admin' | 'env'; keySecret: 'admin' | 'env'; webhookSecret: 'admin' | 'env' };
  /** When the admin last saved credentials; null = never. */
  credentialsUpdatedAt: string | null;
  /** True when saved credentials exist but cannot be read (the server then uses its environment keys). */
  overrideUnreadable: boolean;
}

/**
 * Payment gateway module service: the customer-facing confirmation paths that sit
 * in front of {@link PaymentService}, the hosted checkout used by the mobile app,
 * and the sweep that cancels abandoned online orders.
 */
@Injectable()
export class PaymentGatewayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PaymentGatewayService');
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentService,
    private readonly creds: GatewayCredentials,
    private readonly gatewaySettings: GatewaySettingsService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One sweep of abandoned online orders; never throws (it runs on a timer). */
  async sweep(): Promise<void> {
    try {
      const r = await this.payments.expireAbandoned(ABANDON_AFTER_MS);
      if (r.cancelled > 0 || r.confirmed > 0) {
        this.logger.log(`Abandoned-payment sweep: ${r.cancelled} cancelled, ${r.confirmed} confirmed late, of ${r.checked}`);
      }
    } catch (e) {
      this.logger.warn(`Abandoned-payment sweep failed: ${String(e)}`);
    }
  }

  // ───────────────────────── hosted checkout (mobile app) ─────────────────────────

  private secret(): string {
    return process.env.JWT_ACCESS_SECRET ?? '';
  }

  /** Public https origin of the API (Razorpay live only calls back to https). */
  private publicBase(): string {
    const base = (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, '');
    if (!base.startsWith('https://') && process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('Online payment is not configured (PUBLIC_BASE_URL must be https).');
    }
    return base;
  }

  /** A short-lived link that opens the Razorpay checkout for this order in the phone's browser. */
  async createHostedLink(customerId: string, orderId: string, returnUrl: string): Promise<{ url: string; returnUrl: string }> {
    if (!isAllowedReturnUrl(returnUrl)) throw new BadRequestException('Unsupported return link');
    const cfg = await this.payments.paymentConfigForOrder(customerId, orderId);
    if (cfg.alreadyPaid) throw new BadRequestException('This order is already paid');
    if (cfg.provider !== 'razorpay') throw new BadRequestException('Online payment is not available');

    const token = signHostedToken(
      { o: orderId, c: customerId, r: returnUrl, e: Math.floor(Date.now() / 1000) + HOSTED_TOKEN_TTL_SECONDS },
      this.secret(),
    );
    return { url: `${this.publicBase()}/api/v1/payments/hosted/${token}`, returnUrl };
  }

  private open(token: string): HostedTokenPayload {
    const p = verifyHostedToken(token, this.secret());
    if (!p) throw new ForbiddenException('This payment link has expired. Go back to the app and try again.');
    return p;
  }

  /** HTML for the hosted checkout page (caller supplies the CSP nonce). */
  async hostedPage(token: string, nonce: string): Promise<string> {
    const p = this.open(token);
    const cfg = await this.payments.paymentConfigForOrder(p.c, p.o);
    if (cfg.alreadyPaid) {
      // Paid in the meantime (e.g. a double tap): go straight back to the app.
      throw new BadRequestException('already_paid');
    }
    if (cfg.provider !== 'razorpay') throw new BadRequestException('Online payment is not available');

    const customer = await this.prisma.customer.findUnique({ where: { id: p.c } });
    const base = `${this.publicBase()}/api/v1/payments/hosted`;
    const t = encodeURIComponent(token);
    return renderHostedPage({
      nonce,
      keyId: String(cfg.clientConfig.key ?? ''),
      providerOrderId: String(cfg.clientConfig.orderId ?? ''),
      amountPaise: cfg.amount,
      description: `Belzo order ${p.o.slice(0, 8)}`,
      prefill: {
        name: customer?.name || undefined,
        contact: customer?.phone || undefined,
        email: customer?.email || undefined,
      },
      callbackUrl: `${base}/callback?t=${t}`,
      cancelUrl: `${base}/cancel?t=${t}`,
    });
  }

  /**
   * Razorpay sends the browser back here (POST) after a payment. Verify and confirm it,
   * then return the app deep link to redirect to.
   */
  async hostedCallback(token: string, body: Record<string, unknown>): Promise<string> {
    const p = this.open(token);
    const str = (k: string): string => (typeof body[k] === 'string' ? (body[k] as string) : '');
    const paymentId = str('razorpay_payment_id');
    const orderRef = str('razorpay_order_id');
    const signature = str('razorpay_signature');

    let status: PaymentProgress | 'failed' = 'processing';
    if (paymentId && orderRef && signature) {
      try {
        status = (
          await this.payments.verifyClientPayment(p.c, p.o, {
            razorpayOrderId: orderRef,
            razorpayPaymentId: paymentId,
            razorpaySignature: signature,
          })
        ).status;
      } catch (e) {
        this.logger.warn(`Hosted callback rejected for order ${p.o}: ${String(e)}`);
        status = 'failed';
      }
    } else {
      status = 'failed'; // Razorpay reports a failed/declined payment without a signature
    }
    return this.returnLink(p.r, p.o, status === 'paid' ? 'success' : status === 'processing' ? 'processing' : 'failed');
  }

  /** The customer closed the payment window. */
  hostedCancel(token: string): string {
    const p = this.open(token);
    return this.returnLink(p.r, p.o, 'cancelled');
  }

  /** Where to send the browser when a link can't be used any more (best effort). */
  fallbackReturn(token: string, result: 'success' | 'failed'): string | null {
    const p = verifyHostedToken(token, this.secret());
    return p ? this.returnLink(p.r, p.o, result) : null;
  }

  private returnLink(base: string, orderId: string, result: 'success' | 'processing' | 'failed' | 'cancelled'): string {
    const u = new URL(base);
    u.searchParams.set('orderId', orderId);
    u.searchParams.set('result', result);
    return u.toString();
  }

  // ───────────────────────── admin status ─────────────────────────

  async status(): Promise<GatewayStatus> {
    const c = this.creds.get();
    const o = this.creds.overridden();
    const keyId = c.keyId;
    const [last, open] = await Promise.all([
      this.prisma.webhookEvent.findFirst({ where: { provider: 'razorpay' }, orderBy: { createdAt: 'desc' } }),
      this.prisma.payment.count({
        where: { provider: 'razorpay', status: { in: ['created', 'pending'] }, order: { status: 'pending' } },
      }),
    ]);
    return {
      mode: this.payments.onlinePaymentEnabled ? 'live' : 'mock',
      keyType: keyId.startsWith('rzp_live_') ? 'live' : keyId.startsWith('rzp_test_') ? 'test' : 'none',
      keyHint: keyId ? `${keyId.slice(0, 12)}…${keyId.slice(-3)}` : '',
      secretConfigured: Boolean(c.keySecret),
      webhookSecretConfigured: Boolean(c.webhookSecret),
      webhookUrl: `${(process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '')}/api/v1/payments/webhook`,
      lastWebhookAt: last?.createdAt.toISOString() ?? null,
      openOnlineOrders: open,
      source: {
        keyId: o.keyId ? 'admin' : 'env',
        keySecret: o.keySecret ? 'admin' : 'env',
        webhookSecret: o.webhookSecret ? 'admin' : 'env',
      },
      credentialsUpdatedAt: this.gatewaySettings.lastUpdatedAt,
      overrideUnreadable: this.gatewaySettings.isUnreadable,
    };
  }
}
