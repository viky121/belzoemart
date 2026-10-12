import type { Request } from 'express';
import { CartController } from './cart.controller';
import type { CartService } from './cart.service';
import type { TokenService } from '../identity/token.service';

/** A8: POST /cart/items/:variantId/move-to-cart → saveForLater(ref, variantId, false). */
describe('CartController — move-to-cart (A8)', () => {
  function build() {
    const view = { cartId: 'c1', items: [] };
    const cart = { saveForLater: jest.fn().mockResolvedValue(view) };
    const tokens = {
      verifyAccess: jest.fn().mockResolvedValue({ kind: 'customer', sub: 'c1', roles: [] }),
    };
    const controller = new CartController(
      cart as unknown as CartService,
      tokens as unknown as TokenService,
    );
    return { controller, cart, tokens, view };
  }

  const req = (headers: Record<string, string>) => ({ headers }) as unknown as Request;

  it('guest: resolves the x-guest-token and moves the line back with saved=false', async () => {
    const { controller, cart, view } = build();
    const res = await controller.moveToCart(req({ 'x-guest-token': 'guest-token-1' }), 'v1');
    expect(cart.saveForLater).toHaveBeenCalledTimes(1);
    expect(cart.saveForLater).toHaveBeenCalledWith({ guestToken: 'guest-token-1' }, 'v1', false);
    expect(res).toBe(view);
  });

  it('customer: resolves the Bearer principal', async () => {
    const { controller, cart, tokens } = build();
    await controller.moveToCart(req({ authorization: 'Bearer t' }), 'v1');
    expect(tokens.verifyAccess).toHaveBeenCalledWith('t');
    expect(cart.saveForLater).toHaveBeenCalledWith({ customerId: 'c1' }, 'v1', false);
  });

  it('the existing save-for-later route still passes true', async () => {
    const { controller, cart } = build();
    await controller.saveForLater(req({ 'x-guest-token': 'guest-token-1' }), 'v1');
    expect(cart.saveForLater).toHaveBeenCalledWith({ guestToken: 'guest-token-1' }, 'v1', true);
  });
});
