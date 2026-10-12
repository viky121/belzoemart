import { CheckoutController } from './checkout.controller';
import type { CheckoutService } from './checkout.service';
import { PaymentService } from './payment.service';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { QueueService } from '../../common/queue/queue.service';
import type { InventoryService } from '../catalogue/inventory.service';
import type { CartService } from '../cart/cart.service';
import type { PaymentProvider } from '../../integrations/payment/payment.provider';

const user = { sub: 'cust1', kind: 'customer', roles: [] } as unknown as JwtPrincipal;
const ADDR = '11111111-1111-4111-8111-111111111111';

describe('CheckoutController.preview (A6)', () => {
  function build() {
    const checkout = { preview: jest.fn().mockResolvedValue({ breakup: {} }) };
    const controller = new CheckoutController(
      checkout as unknown as CheckoutService,
      {} as PaymentService,
    );
    return { controller, checkout };
  }

  it("passes isCod=true for paymentMethod 'cod'", async () => {
    const { controller, checkout } = build();
    await controller.preview(user, { addressId: ADDR, couponCode: 'SAVE10', paymentMethod: 'cod' });
    expect(checkout.preview).toHaveBeenCalledWith({ customerId: 'cust1' }, ADDR, 'SAVE10', true);
  });

  it("passes isCod=false for 'upi'", async () => {
    const { controller, checkout } = build();
    await controller.preview(user, { addressId: ADDR, paymentMethod: 'upi' });
    expect(checkout.preview).toHaveBeenCalledWith({ customerId: 'cust1' }, ADDR, undefined, false);
  });

  it('passes isCod=false when paymentMethod is missing (web, unchanged)', async () => {
    const { controller, checkout } = build();
    await controller.preview(user, { addressId: ADDR });
    expect(checkout.preview).toHaveBeenCalledWith({ customerId: 'cust1' }, ADDR, undefined, false);
  });
});

describe('CheckoutController.place — replayed key (A7)', () => {
  it('a reused mock order keeps its captured payment and never creates a gateway order', async () => {
    const payment = {
      id: 'p1',
      orderId: 'o1',
      provider: 'mock',
      amount: 118000,
      status: 'captured',
      providerOrderId: 'mock_1',
    };
    const prisma = {
      order: {
        findUnique: jest.fn(async () => ({
          id: 'o1',
          customerId: 'cust1',
          status: 'confirmed',
          items: [],
          payments: [{ ...payment }],
        })),
      },
      payment: {
        updateMany: jest.fn(
          async ({ where, data }: { where: { id: string; status: string }; data: { status: string } }) => {
            const match = where.id === payment.id && where.status === payment.status;
            if (match) Object.assign(payment, data);
            return { count: match ? 1 : 0 };
          },
        ),
        update: jest.fn(),
      },
    } as unknown as PrismaService;
    const provider = {
      kind: 'mock' as const,
      createOrder: jest.fn(),
      verifyWebhook: jest.fn(),
      createRefund: jest.fn(),
    };
    const payments = new PaymentService(
      prisma,
      {} as InventoryService,
      { enqueue: jest.fn() } as unknown as QueueService,
      provider as unknown as PaymentProvider,
      { removePurchased: jest.fn() } as unknown as CartService,
    );
    const breakup = {
      subtotal: 100000, discount: 0, shipping: 0, codFee: 0, tax: 18000,
      gst: { cgst: 9000, sgst: 9000, igst: 0 }, grandTotal: 118000,
    };
    const checkout = {
      place: jest.fn().mockResolvedValue({
        orderId: 'o1',
        reused: true,
        breakup,
        payment: { provider: 'mock', amount: 118000 },
      }),
    };
    const controller = new CheckoutController(checkout as unknown as CheckoutService, payments);

    const res = await controller.place(user, { addressId: ADDR, paymentMethod: 'upi' }, 'KEY-1');

    expect(res).toEqual({
      orderId: 'o1',
      reused: true,
      breakup,
      payment: { provider: 'mock', amount: 118000, clientConfig: {} },
    });
    expect(provider.createOrder).not.toHaveBeenCalled();
    expect((prisma as unknown as { payment: { update: jest.Mock } }).payment.update).not.toHaveBeenCalled();
    expect(payment).toMatchObject({ status: 'captured', providerOrderId: 'mock_1' });
  });
});
