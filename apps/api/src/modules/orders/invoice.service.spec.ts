import { InvoiceService } from './invoice.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { StorageProvider } from '../../integrations/storage/storage.provider';
import type { SettingsService } from '../admin/settings.service';

/**
 * InvoiceService: store identity from settings (with env/default fallbacks),
 * storage key + Cache-Control, HSN lookup via variant -> product, and
 * regenerate() keeping the same number and key.
 */
describe('InvoiceService', () => {
  const ORDER = {
    id: 'order-1',
    customerId: 'cust-1',
    addressId: 'addr-1',
    createdAt: new Date('2025-03-14T10:00:00Z'),
    couponCode: null,
    subtotal: 100000,
    discount: 0,
    shipping: 4900,
    codFee: 0,
    tax: 18000,
    cgst: 9000,
    sgst: 9000,
    igst: 0,
    grandTotal: 122900,
    status: 'confirmed',
    items: [{ variantId: 'v-1', title: 'Widget', sku: 'W-1', unitPrice: 50000, quantity: 2, taxRatePct: 18 }],
    payments: [],
  };

  function build(
    settingsMap: Record<string, unknown>,
    existingInvoice: { orderId: string; number: string; url: string; createdAt: Date } | null = null,
    payments: unknown[] = [],
  ) {
    const puts: { key: string; html: string; cacheControl?: string }[] = [];
    const prisma = {
      invoice: {
        findUnique: jest.fn(async () => existingInvoice),
        create: jest.fn(async () => ({})),
        update: jest.fn(async () => ({})),
      },
      order: {
        findUnique: jest.fn(async () => ({ ...ORDER, payments })),
        update: jest.fn(async () => ({})),
      },
      address: {
        findUnique: jest.fn(async () => ({
          fullName: 'Asha Rao',
          phone: '9876543210',
          line1: '221B Residency Road',
          line2: null,
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560025',
        })),
      },
      customer: { findUnique: jest.fn(async () => ({ name: 'Asha', email: 'asha@example.com', phone: null })) },
      variant: { findMany: jest.fn(async () => [{ id: 'v-1', mrp: 60000, product: { hsnCode: '8471' } }]) },
      invoiceCounter: {
        upsert: jest.fn(async ({ where: { year } }: { where: { year: number } }) => ({ year, seq: 7 })),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const storage = {
      put: jest.fn(async ({ key, body, cacheControl }: { key: string; body: Buffer; cacheControl?: string }) => {
        puts.push({ key, html: body.toString('utf8'), cacheControl });
        return { url: `https://files/${key}` };
      }),
      getUrl: (key: string) => `https://files/${key}`,
    } as unknown as StorageProvider;

    const settings = { get: async (key: string) => settingsMap[key] } as unknown as SettingsService;

    return {
      svc: new InvoiceService(prisma as unknown as PrismaService, storage, settings),
      prisma,
      puts,
      getHtml: () => puts[puts.length - 1]?.html ?? '',
    };
  }

  describe('store identity from settings', () => {
    it('uses the configured GSTIN and store name when settings are present', async () => {
      const { svc, getHtml } = build({ 'store.gstin': '29ABCDE1234F1Z5', 'store.name': 'Acme Traders' });
      await svc.generate('order-1');
      const html = getHtml();
      expect(html).toContain('29ABCDE1234F1Z5');
      expect(html).toContain('PAN: ABCDE1234F');
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

    it("prints 'GSTIN: Not registered' when neither settings nor env provide a GSTIN", async () => {
      const prev = process.env.STORE_GSTIN;
      delete process.env.STORE_GSTIN;
      try {
        const { svc, getHtml } = build({});
        await svc.generate('order-1');
        expect(getHtml()).toContain('GSTIN: Not registered');
        expect(getHtml()).not.toContain('GSTIN-UNSET');
        expect(getHtml()).not.toContain('PAN:');
      } finally {
        if (prev !== undefined) process.env.STORE_GSTIN = prev;
      }
    });

    it('prints the FSSAI licence and the food declaration only when store.fssai is set', async () => {
      const on = build({ 'store.fssai': '21426510000951' });
      await on.svc.generate('order-1');
      expect(on.getHtml()).toContain('FSSAI Lic No: 21426510000951');
      expect(on.getHtml()).toContain('food products mentioned in this invoice');
      const off = build({});
      await off.svc.generate('order-1');
      expect(off.getHtml()).not.toContain('FSSAI');
    });
    it("takes today's MRP for an item whose order saved none, and links the QR code to the order page", async () => {
      const prev = process.env.PUBLIC_BASE_URL;
      process.env.PUBLIC_BASE_URL = 'https://belzoemart.com';
      try {
        const { svc, getHtml } = build({});
        await svc.generate('order-1');
        expect(getHtml()).toContain('MRP 600.00');
        expect(getHtml()).toContain('You have saved Rs. 200.00');
        expect(getHtml()).toContain('<svg class="qr"');
      } finally {
        if (prev === undefined) delete process.env.PUBLIC_BASE_URL;
        else process.env.PUBLIC_BASE_URL = prev;
      }
    });
    describe('payment QR code on a Cash on Delivery invoice', () => {
      const COD = [{ provider: 'cod', status: 'pending', method: null, providerPaymentId: null, createdAt: new Date('2025-03-14T10:00:00Z') }];
      const PAID = [{ ...COD[0]!, provider: 'razorpay', status: 'captured' }];
      it('uses the shop SBI UPI QR code by default', async () => {
        const { svc, getHtml } = build({}, null, COD);
        await svc.generate('order-1');
        expect(getHtml()).toContain('Scan to pay Rs.');
        expect(getHtml()).toContain('UPI ID: SBIBHIM.INSTANT97993723982907045@sbipay');
        expect(getHtml()).not.toContain('Scan to view your order');
      });
      it("uses the admin's own UPI link, and ignores a setting that is not a upi://pay link", async () => {
        const own = build({ 'store.codPaymentQr': 'upi://pay?pa=own@okbank&tn=x' }, null, COD);
        await own.svc.generate('order-1');
        expect(own.getHtml()).toContain('UPI ID: own@okbank');
        const bad = build({ 'store.codPaymentQr': 'https://evil.example' }, null, COD);
        await bad.svc.generate('order-1');
        expect(bad.getHtml()).toContain('UPI ID: SBIBHIM.INSTANT97993723982907045@sbipay');
      });
      it('keeps the order QR code on a paid online order', async () => {
        const prev = process.env.PUBLIC_BASE_URL;
        process.env.PUBLIC_BASE_URL = 'https://belzoemart.com';
        try {
          const { svc, getHtml } = build({}, null, PAID);
          await svc.generate('order-1');
          expect(getHtml()).toContain('Scan to view your order');
          expect(getHtml()).not.toContain('UPI ID');
        } finally {
          if (prev === undefined) delete process.env.PUBLIC_BASE_URL;
          else process.env.PUBLIC_BASE_URL = prev;
        }
      });
    });
    it('renders the new store identity settings and the product HSN', async () => {
      const { svc, getHtml, prisma } = build({
        'store.name': 'Belzo eMart',
        'store.legalName': 'Belzo Retail Pvt Ltd',
        'store.address': '12 MG Road',
        'store.city': 'Bengaluru',
        'store.pincode': '560038',
        'store.state': 'Karnataka',
        'store.phone': '+91 80 1234 5678',
        'store.email': 'billing@belzo.example',
        'store.website': 'https://belzo.example',
        'store.invoiceTerms': 'No returns on perishables.',
      });
      await svc.generate('order-1');
      const html = getHtml();
      for (const s of [
        'BELZO RETAIL PVT LTD',
        '(Belzo eMart)',
        '12 MG Road',
        'Bengaluru, Karnataka, 560038',
        '+91 80 1234 5678',
        'billing@belzo.example',
        'https://belzo.example',
        'No returns on perishables.',
        '>8471</span>',
        'Asha',
        'Karnataka (29)',
      ]) {
        expect(html).toContain(s);
      }
      expect(prisma.variant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['v-1'] } } }),
      );
    });
  });

  describe('generate()', () => {
    it('stores at invoices/<orderId>.html with a no-cache policy and allocates one number', async () => {
      const { svc, puts, prisma } = build({});
      const res = await svc.generate('order-1');
      expect(res.number).toMatch(/^BELZO\/\d{4}\/00007$/);
      expect(puts).toHaveLength(1);
      expect(puts[0]!.key).toBe('invoices/order-1.html');
      expect(puts[0]!.cacheControl).toMatch(/^no-cache/);
      expect(prisma.invoiceCounter.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.invoice.create).toHaveBeenCalledWith({
        data: { orderId: 'order-1', number: res.number, url: 'https://files/invoices/order-1.html' },
      });
    });

    it('returns the existing invoice without rendering again', async () => {
      const existing = { orderId: 'order-1', number: 'BELZO/2025/00003', url: 'https://files/x', createdAt: new Date() };
      const { svc, puts, prisma } = build({}, existing);
      await expect(svc.generate('order-1')).resolves.toEqual({ url: 'https://files/x', number: 'BELZO/2025/00003' });
      expect(puts).toHaveLength(0);
      expect(prisma.invoiceCounter.upsert).not.toHaveBeenCalled();
    });

    it('does not allocate a number when the order is missing', async () => {
      const { svc, prisma } = build({});
      prisma.order.findUnique.mockResolvedValueOnce(null as never);
      await expect(svc.generate('missing')).rejects.toThrow('Order not found');
      expect(prisma.invoiceCounter.upsert).not.toHaveBeenCalled();
    });
  });

  describe('regenerate()', () => {
    it('re-renders the SAME key with the SAME number and never allocates a new one', async () => {
      const existing = {
        orderId: 'order-1',
        number: 'BELZO/2025/00003',
        url: 'https://files/invoices/order-1.html?v=1',
        createdAt: new Date('2025-03-15T09:00:00Z'),
      };
      const { svc, puts, prisma, getHtml } = build({}, existing);
      const res = await svc.regenerate('order-1');

      expect(res.number).toBe('BELZO/2025/00003');
      expect(prisma.invoiceCounter.upsert).not.toHaveBeenCalled();
      expect(prisma.invoice.create).not.toHaveBeenCalled();
      expect(puts).toHaveLength(1);
      expect(puts[0]!.key).toBe('invoices/order-1.html');
      expect(puts[0]!.cacheControl).toMatch(/^no-cache/);
      expect(getHtml()).toContain('BELZO/2025/00003');
      expect(getHtml()).toContain('15/03/2025'); // original invoice date kept

      expect(res.url).toMatch(/^https:\/\/files\/invoices\/order-1\.html\?v=\d+$/);
      expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { orderId: 'order-1' }, data: { url: res.url } });
      expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { invoiceUrl: res.url } });
    });

    it('falls back to generate() when the order has no invoice yet', async () => {
      const { svc, prisma, puts } = build({});
      const res = await svc.regenerate('order-1');
      expect(prisma.invoiceCounter.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
      expect(puts[0]!.key).toBe('invoices/order-1.html');
      expect(res.number).toMatch(/00007$/);
    });

    it.each(['pending', 'cancelled'])(
      'rejects first-time generation for a %s order without spending a number',
      async (status) => {
        const { svc, prisma, puts } = build({});
        prisma.order.findUnique.mockResolvedValue({ ...ORDER, status } as never);
        await expect(svc.regenerate('order-1')).rejects.toThrow(`No invoice can be issued for a ${status} order`);
        await expect(svc.generate('order-1')).rejects.toThrow(`No invoice can be issued for a ${status} order`);
        expect(prisma.invoiceCounter.upsert).not.toHaveBeenCalled();
        expect(prisma.invoice.create).not.toHaveBeenCalled();
        expect(puts).toHaveLength(0);
      },
    );

    it('still re-renders an existing invoice for a cancelled order (same number)', async () => {
      const existing = { orderId: 'order-1', number: 'BELZO/2025/00003', url: 'https://files/x', createdAt: new Date() };
      const { svc, prisma } = build({}, existing);
      prisma.order.findUnique.mockResolvedValue({ ...ORDER, status: 'cancelled' } as never);
      const res = await svc.regenerate('order-1');
      expect(res.number).toBe('BELZO/2025/00003');
      expect(prisma.invoiceCounter.upsert).not.toHaveBeenCalled();
    });
  });
});
