import { CheckoutController } from './checkout.controller';
import type { CheckoutService } from './checkout.service';
import type { PaymentService } from './payment.service';
import type { JwtPrincipal } from '../../common/auth/jwt.types';

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
