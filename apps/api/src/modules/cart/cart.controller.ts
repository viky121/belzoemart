import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { cartItemInputSchema } from '@belzo/shared';
import { Public } from '../../common/auth/public.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { createZodDto } from '../identity/zod-dto';
import { TokenService } from '../identity/token.service';
import { CartService } from './cart.service';
import { resolveCartRef } from './cart-context';

class CartItemDto extends createZodDto(cartItemInputSchema) {}

/**
 * Cart endpoints (FR-4.1, FR-4.2). Public so guests can build a cart via an
 * `x-guest-token` header; authenticated customers are resolved from the bearer
 * token. Merge is authenticated (requires the customer principal).
 */
@ApiTags('cart')
@Controller('cart')
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Get()
  async get(@Req() req: Request) {
    return this.cart.getCart(await resolveCartRef(req, this.tokens));
  }

  @Public()
  @Post('items')
  async add(@Req() req: Request, @Body() dto: CartItemDto) {
    return this.cart.addItem(await resolveCartRef(req, this.tokens), dto.variantId, dto.quantity);
  }

  @Public()
  @Put('items/:variantId')
  async update(@Req() req: Request, @Param('variantId') variantId: string, @Body() dto: CartItemDto) {
    return this.cart.updateItem(await resolveCartRef(req, this.tokens), variantId, dto.quantity);
  }

  @Public()
  @Delete('items/:variantId')
  async remove(@Req() req: Request, @Param('variantId') variantId: string) {
    return this.cart.removeItem(await resolveCartRef(req, this.tokens), variantId);
  }

  @Public()
  @Post('items/:variantId/save-for-later')
  async saveForLater(@Req() req: Request, @Param('variantId') variantId: string) {
    return this.cart.saveForLater(await resolveCartRef(req, this.tokens), variantId, true);
  }

  /** Inverse of save-for-later: move a saved line back into the active cart (quantity kept). */
  @Public()
  @Post('items/:variantId/move-to-cart')
  async moveToCart(@Req() req: Request, @Param('variantId') variantId: string) {
    return this.cart.saveForLater(await resolveCartRef(req, this.tokens), variantId, false);
  }

  @Post('merge')
  async merge(@CurrentUser() user: JwtPrincipal, @Body() body: { guestToken: string }) {
    return this.cart.merge(body.guestToken, user.sub);
  }
}
