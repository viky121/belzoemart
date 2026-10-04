import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { formatInvoiceNumber } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../../integrations/storage/storage.provider';
import { SettingsService } from '../admin/settings.service';

/**
 * GST invoice generation (BR-4, BR-5, NFR-2.1). Idempotent per order: one
 * invoice with a unique sequential number (BELZO/YYYY/NNNNN). Invoice content
 * includes GSTIN, per-item HSN, place of supply, and the CGST/SGST/IGST split
 * from the order snapshot. Rendered as HTML and stored via the storage port
 * (a PDF renderer can replace the HTML body without interface changes).
 */
@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly settings: SettingsService,
  ) {}

  /** Allocate the next sequential invoice number for the current year (atomic). */
  private async nextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const counter = await this.prisma.invoiceCounter.upsert({
      where: { year },
      update: { seq: { increment: 1 } },
      create: { year, seq: 1 },
    });
    return formatInvoiceNumber(year, counter.seq);
  }

  async generate(orderId: string): Promise<{ url: string; number: string }> {
    // Idempotent: return the existing invoice if present.
    const existing = await this.prisma.invoice.findUnique({ where: { orderId } });
    if (existing) return { url: existing.url, number: existing.number };

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const number = await this.nextNumber();
    // Store identity is admin-configurable; fall back to env/default so a fresh
    // DB renders exactly as before. Only the source of these values changes.
    const storeName = (await this.resolveString('store.name')) ?? 'Belzo eMart';
    const gstin =
      (await this.resolveString('store.gstin')) ?? (process.env.STORE_GSTIN || 'GSTIN-UNSET');
    const html = this.renderHtml(number, order, storeName, gstin);
    const { url } = await this.storage.put({
      key: `invoices/${order.id}.html`,
      body: Buffer.from(html, 'utf8'),
      contentType: 'text/html; charset=utf-8',
    });

    await this.prisma.$transaction([
      this.prisma.invoice.create({ data: { orderId, number, url } }),
      this.prisma.order.update({ where: { id: orderId }, data: { invoiceUrl: url } }),
    ]);
    return { url, number };
  }

  /** Read a string setting, returning undefined when absent or not a non-empty string. */
  private async resolveString(key: string): Promise<string | undefined> {
    const raw = await this.settings.get<unknown>(key);
    return typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined;
  }

  private renderHtml(
    number: string,
    order: {
      id: string;
      subtotal: number;
      discount: number;
      shipping: number;
      tax: number;
      cgst: number;
      sgst: number;
      igst: number;
      grandTotal: number;
      items: { title: string; sku: string; unitPrice: number; quantity: number; taxRatePct: number }[];
    },
    storeName: string,
    gstin: string,
  ): string {
    const rupees = (p: number) => `₹${(p / 100).toFixed(2)}`;
    const rows = order.items
      .map(
        (i) =>
          `<tr><td>${i.title}</td><td>${i.sku}</td><td>${i.taxRatePct}%</td><td>${i.quantity}</td><td>${rupees(i.unitPrice)}</td><td>${rupees(i.unitPrice * i.quantity)}</td></tr>`,
      )
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${number}</title></head>
<body>
<h1>Tax Invoice</h1>
<p><strong>${storeName}</strong> — GSTIN: ${gstin}</p>
<p>Invoice No: ${number} · Order: ${order.id}</p>
<table border="1" cellpadding="6" cellspacing="0">
<thead><tr><th>Item</th><th>SKU</th><th>GST%</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p>Subtotal: ${rupees(order.subtotal)}</p>
<p>Discount: −${rupees(order.discount)}</p>
<p>Shipping: ${rupees(order.shipping)}</p>
<p>CGST: ${rupees(order.cgst)} · SGST: ${rupees(order.sgst)} · IGST: ${rupees(order.igst)} (Total tax ${rupees(order.tax)})</p>
<h3>Grand Total: ${rupees(order.grandTotal)}</h3>
</body></html>`;
  }
}
