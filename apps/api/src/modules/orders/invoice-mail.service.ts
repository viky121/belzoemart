import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EMAIL_PROVIDER, type EmailProvider } from '../../integrations/notifications/channels';
import { invoiceEmail } from '../../integrations/notifications/email-templates';
import { InvoiceService } from './invoice.service';

/**
 * Generates an order's invoice and emails it to the customer as a PDF (worker side).
 * Emailing is best effort: the invoice itself is already stored, so a mail problem is logged
 * and never fails (or re-runs) the invoice job.
 */
@Injectable()
export class InvoiceMailService {
  private readonly logger = new Logger('InvoiceMailService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoiceService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  /** Create the invoice (idempotent). The email goes out only when this call created it, so retries never re-send. */
  async generateAndEmail(orderId: string): Promise<void> {
    const had = await this.prisma.invoice.findUnique({ where: { orderId }, select: { orderId: true } });
    await this.invoices.generate(orderId);
    if (had) return;
    try {
      await this.emailInvoice(orderId);
    } catch (err) {
      this.logger.error(`Invoice email for order ${orderId} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Email the stored invoice as a PDF attachment to the order's customer (no-op without an email address). */
  async emailInvoice(orderId: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    if (!order) return false;
    const customer = await this.prisma.customer.findUnique({ where: { id: order.customerId } });
    if (!customer?.email) return false;

    const { pdf, number } = await this.invoices.renderPdf(orderId);
    const mail = invoiceEmail({ name: customer.name, orderId, invoiceNumber: number });
    await this.email.send({
      to: customer.email,
      subject: mail.subject,
      html: mail.html,
      attachments: [
        {
          filename: `Invoice-${number.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    });
    return true;
  }
}
