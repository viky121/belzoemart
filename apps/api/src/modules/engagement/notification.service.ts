import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EMAIL_PROVIDER, PUSH_PROVIDER, WHATSAPP_PROVIDER, type EmailProvider, type PushProvider, type WhatsAppProvider } from '../../integrations/notifications/channels';
import { SMS_PROVIDER, type SmsProvider } from '../../integrations/sms/sms.provider';

type NotificationType =
  | 'order.confirmed'
  | 'order.payment_failed'
  | 'order.shipped'
  | 'order.delivered'
  | 'dpdp.export'
  | 'abandoned_cart'
  | 'generic';

interface RenderedTemplate {
  title: string;
  body: string;
}

/**
 * Notification service (FR-6.3, FR-13.5). Renders a localized template, records
 * an in-app notification, and fans out to channels via ports. Channel failures
 * are non-fatal (best-effort) so one channel does not block others.
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  private render(type: NotificationType, data: Record<string, string>, locale: string): RenderedTemplate {
    const hi = locale === 'hi';
    switch (type) {
      case 'order.confirmed':
        return { title: hi ? 'ऑर्डर पुष्ट' : 'Order confirmed', body: hi ? `आपका ऑर्डर ${data.orderId} पुष्ट हो गया।` : `Your order ${data.orderId} is confirmed.` };
      case 'order.payment_failed':
        return { title: hi ? 'भुगतान विफल' : 'Payment failed', body: hi ? `ऑर्डर ${data.orderId} का भुगतान विफल रहा।` : `Payment for order ${data.orderId} failed.` };
      case 'order.shipped':
        return { title: hi ? 'ऑर्डर भेजा गया' : 'Order shipped', body: `Order ${data.orderId} is on its way.` };
      case 'order.delivered':
        return { title: hi ? 'ऑर्डर वितरित' : 'Order delivered', body: `Order ${data.orderId} delivered. Rate your purchase!` };
      case 'abandoned_cart':
        return { title: hi ? 'आपका कार्ट इंतज़ार कर रहा है' : 'Your cart is waiting', body: 'Complete your purchase before items sell out.' };
      default:
        return { title: data.title ?? 'Belzo eMart', body: data.body ?? '' };
    }
  }

  /**
   * Send a notification: persist in-app + dispatch to channels. `contact`
   * carries the customer's email/phone for external channels.
   */
  async send(input: {
    customerId: string;
    type: NotificationType;
    data?: Record<string, string>;
    locale?: string;
    contact?: { email?: string; phone?: string };
  }): Promise<void> {
    const tpl = this.render(input.type, input.data ?? {}, input.locale ?? 'en');

    await this.prisma.notification.create({
      data: { customerId: input.customerId, type: input.type, title: tpl.title, body: tpl.body },
    });

    const tasks: Promise<unknown>[] = [
      this.push.send({ customerId: input.customerId, title: tpl.title, body: tpl.body }),
    ];
    if (input.contact?.email) {
      tasks.push(this.email.send({ to: input.contact.email, subject: tpl.title, html: `<p>${tpl.body}</p>` }));
    }
    if (input.contact?.phone) {
      tasks.push(this.sms.send({ to: input.contact.phone, body: `${tpl.title}: ${tpl.body}`, templateId: 'BELZO_TXN' }));
      tasks.push(this.whatsapp.send({ to: input.contact.phone, template: input.type, body: tpl.body }));
    }
    // Best-effort: never let a channel failure break the flow.
    await Promise.allSettled(tasks);
  }

  listInApp(customerId: string) {
    return this.prisma.notification.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(customerId: string, ids: string[]) {
    await this.prisma.notification.updateMany({
      where: { customerId, id: { in: ids } },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
