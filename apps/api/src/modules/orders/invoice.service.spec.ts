import { InvoiceService } from './invoice.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { StorageProvider } from '../../integrations/storage/storage.provider';
import type { SettingsService } from '../admin/settings.service';

/**
 * Proves InvoiceService sources the store GSTIN and name from admin settings
 * when present, and falls back to env/default when absent — while the invoice
 * HTML structure stays unchanged.
 */
describe('InvoiceService — store identity from settings', () => {
  function build(settingsMap: Record<string, unknown>) {
    let capturedHtml = '';
    const prisma = {
      invoice: {
        findUnique: async () => null,
        create: async () => ({}),
      },
      order: {
        findUnique: async () => ({
          id: 'order-1',
          subtotal: 100000,
          discount: 0,
          shipping: 4900,
          tax: 18000,
          cgst: 9000,
          sgst: 9000,
          igst: 0,
          grandTotal: 122900,
          items: [{ title: 'Widget', sku: 'W-1', unitPrice: 50000, quantity: 2, taxRatePct: 18 }],
        }),
        update: async () => ({}),
      },
      invoiceCounter: {
        upsert: async ({ where: { year } }: { where: { year: number } }) => ({ year, seq: 7 }),
      },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    } as unknown as PrismaService;

    const storage = {
      put: async ({ body }: { body: Buffer }) => {
        capturedHtml = body.toString('utf8');
        return { url: 'https://files/invoices/order-1.html' };
      },
      getUrl: (key: string) => `https://files/${key}`,
    } as unknown as StorageProvider;

    const settings = { get: async (key: string) => settingsMap[key] } as unknown as SettingsService;

    return { svc: new InvoiceService(prisma, storage, settings), getHtml: () => capturedHtml };
  }

  it('uses the configured GSTIN and store name when settings are present', async () => {
    const { svc, getHtml } = build({ 'store.gstin': '29ABCDE1234F1Z5', 'store.name': 'Acme Traders' });
    await svc.generate('order-1');
    const html = getHtml();
    expect(html).toContain('29ABCDE1234F1Z5');
    expect(html).toContain('Acme Traders');
    expect(html).not.toContain('Belzo eMart');
  });

  it('falls back to env STORE_GSTIN and default store name when settings are absent', async () => {
    const prev = process.env.STORE_GSTIN;
    process.env.STORE_GSTIN = '27ENVGSTIN999Z1';
    try {
      const { svc, getHtml } = build({});
      await svc.generate('order-1');
      const html = getHtml();
      expect(html).toContain('27ENVGSTIN999Z1');
      expect(html).toContain('Belzo eMart');
    } finally {
      if (prev === undefined) delete process.env.STORE_GSTIN;
      else process.env.STORE_GSTIN = prev;
    }
  });

  it('falls back to GSTIN-UNSET when neither settings nor env provide a GSTIN', async () => {
    const prev = process.env.STORE_GSTIN;
    delete process.env.STORE_GSTIN;
    try {
      const { svc, getHtml } = build({});
      await svc.generate('order-1');
      expect(getHtml()).toContain('GSTIN-UNSET');
    } finally {
      if (prev !== undefined) process.env.STORE_GSTIN = prev;
    }
  });
});
