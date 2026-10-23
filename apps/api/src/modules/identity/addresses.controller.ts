import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { AddressService } from './address.service';
import { PincodeService } from './pincode.service';
import { AddressDto } from './dto';

/**
 * Customer address book (FR-1.5). All operations are scoped to the caller and
 * ownership is enforced in the service (BR-10).
 */
@ApiTags('addresses')
@ApiBearerAuth()
@Controller('me/addresses')
export class AddressesController {
  constructor(
    private readonly addresses: AddressService,
    private readonly pincode: PincodeService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtPrincipal) {
    return this.addresses.list(user.sub);
  }

  @Get('resolve-pincode')
  resolve(@Query('pincode') pincode: string) {
    return this.pincode.resolve(pincode) ?? { city: null, state: null };
  }

  @Post()
  add(
    @CurrentUser() user: JwtPrincipal,
    @Body() dto: AddressDto,
    @Query('default') makeDefault?: string,
  ) {
    return this.addresses.add(user.sub, dto, makeDefault === 'true');
  }

  @Put(':id')
  update(
    @CurrentUser() user: JwtPrincipal,
    @Param('id') id: string,
    @Body() dto: AddressDto,
    @Query('default') makeDefault?: string,
  ) {
    return this.addresses.update(user.sub, id, dto, makeDefault === 'true');
  }

  @Delete(':id')
  async remove(@CurrentUser() user: JwtPrincipal, @Param('id') id: string) {
    await this.addresses.remove(user.sub, id);
    return { success: true };
  }
}
