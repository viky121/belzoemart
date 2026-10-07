import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { formatInvoiceNumber, gstStateCode, panFromGstin } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../../integrations/storage/storage.provider';
import { SettingsService } from '../admin/settings.service';
import {
  buildInvoiceDocument,
  renderInvoiceHtml,
  type InvoiceOrder,
  type InvoiceSeller,
} from './invoice-document';

export const INVOICE_KEY = (orderId: string) => `invoices/${orderId}.html`;
/** Invoices are overwritten in place on regenerate, so they must not be cached as immutable. */
export const INVOICE_CACHE_CONTROL = 'no-cache, max-age=0, must-revalidate';

/**
 * GST tax invoice generation (BR-4, BR-5, NFR-2.1).
 *
 * - `generate()` is idempotent per order: one invoice with a unique sequential
 *   number (BELZO/YYYY/NNNNN), stored at `invoices/<orderId>.html`.
 * - `regenerate()` re-renders an existing invoice with the current template and
 *   store details, overwriting the SAME key and keeping the SAME number and
 *   invoice date (a number is never re-allocated). The stored URL gets a `?v=`
 *   cache-buster so customer/admin links open the current file.
 *
 * Layout (see invoice-document.ts): TAX INVOICE header with seller identity
 * (GSTIN/PAN/state code), invoice + order meta, Bill To / Ship To, per-line
 * HSN/discount/taxable/GST split, totals with amount in words, HSN summary and
 * the declaration/signatory footer. All amounts come from the order snapshot.
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

    // Check the order exists BEFORE allocating a number.
    const order = await this.loadOrder(orderId);
    const number = await this.nextNumber();
    const url = await this.render(order, number, new Date());

    await this.prisma.$transaction([
      this.prisma.invoice.create({ data: { orderId, number, url } }),
      this.prisma.order.update({ where: { id: orderId }, data: { invoiceUrl: url } }),
    ]);
    return { url, number };
  }

  /**
   * Re-render an existing invoice in place (same key, same number, same
   * invoice date). Falls back to `generate()` when the order has no invoice yet.
   */
  async regenerate(orderId: string): Promise<{ url: string; number: string }> {
    const existing = await this.prisma.invoice.findUnique({ where: { orderId } });
    if (!existing) return this.generate(orderId);

    const order = await this.loadOrder(orderId);
    const url = await this.render(order, existing.number, existing.createdAt);
    const versioned = `${url.split('?')[0]}?v=${Date.now()}`;

    await this.prisma.$transaction([
      this.prisma.invoice.update({ where: { orderId }, data: { url: versioned } }),
      this.prisma.order.update({ where: { id: orderId }, data: { invoiceUrl: versioned } }),
    ]);
    return { url: versioned, number: existing.number };
  }

  private async loadOrder(orderId: string): Promise<InvoiceOrder & { customerId: string; addressId: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Render the invoice HTML for `order` and store it at the invoice key; returns the storage URL. */
  private async render(
    order: InvoiceOrder & { customerId: string; addressId: string },
    number: string,
    invoiceDate: Date,
  ): Promise<string> {
    const variantIds = [...new Set(order.items.map((i) => i.variantId))];
    // Address/customer may be gone (deleted / DPDP-anonymised): render '-' instead of failing.
    const [address, customer, variants, seller] = await Promise.all([
      this.prisma.address.findUnique({ where: { id: order.addressId } }),
      this.prisma.customer.findUnique({ where: { id: order.customerId } }),
      variantIds.length
        ? this.prisma.variant.findMany({
            where: { id: { in: variantIds } },
            select: { id: true, product: { select: { hsnCode: true } } },
          })
        : Promise.resolve([] as { id: string; product: { hsnCode: string } | null }[]),
      this.loadSeller(),
    ]);
    const hsnByVariant = new Map<string, string>(
      variants.map((v) => [v.id, v.product?.hsnCode ?? ''] as [string, string]),
    );

    const html = renderInvoiceHtml(
      buildInvoiceDocument({ number, invoiceDate, order, hsnByVariant, address, customer, seller }),
    );
    const { url } = await this.storage.put({
      key: INVOICE_KEY(order.id),
      body: Buffer.from(html, 'utf8'),
      contentType: 'text/html; charset=utf-8',
      cacheControl: INVOICE_CACHE_CONTROL,
    });
    return url;
  }

  /** Store identity for the invoice header, from admin settings with env/default fallbacks. */
  private async loadSeller(): Promise<InvoiceSeller> {
    const [name, legalName, gstinSetting, address, city, pincode, stateSetting, phone, email, website, logoUrl, terms] =
      await Promise.all(
        [
          'store.name',
          'store.legalName',
          'store.gstin',
          'store.address',
          'store.city',
          'store.pincode',
          'store.state',
          'store.phone',
          'store.email',
          'store.website',
          'store.logoUrl',
          'store.invoiceTerms',
        ].map((k) => this.resolveString(k)),
      );
    const storeName = name ?? 'Belzo eMart';
    const gstin = (gstinSetting ?? (process.env.STORE_GSTIN || '').trim()) || null;
    // Same fallback chain as checkout pricing so the seller state matches the charged regime.
    const sellerState = stateSetting ?? (process.env.STORE_STATE?.trim() || 'Karnataka');
    return {
      name: storeName,
      legalName: legalName ?? storeName,
      address: address ?? null,
      city: city ?? null,
      state: sellerState,
      stateCode: gstStateCode(sellerState),
      pincode: pincode ?? null,
      gstin: gstin ? gstin.toUpperCase() : null,
      pan: panFromGstin(gstin),
      phone: phone ?? null,
      email: email ?? null,
      website: website ?? null,
      logoUrl: logoUrl ?? null,
      terms: terms ?? null,
    };
  }

  /** Read a string setting, returning undefined when absent or not a non-empty string. */
  private async resolveString(key: string): Promise<string | undefined> {
    const raw = await this.settings.get<unknown>(key);
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
  }
}
