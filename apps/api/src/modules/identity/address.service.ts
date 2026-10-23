import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AddressInput } from '@belzo/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Customer address book (FR-1.5). Enforces:
 * - ownership: a customer only sees/edits their own addresses (BR-10, IDOR).
 * - at most one default address per customer (BR-11): setting a new default
 *   clears the flag on the others, in a transaction.
 */
@Injectable()
export class AddressService {
  constructor(private readonly prisma: PrismaService) {}

  list(customerId: string) {
    return this.prisma.address.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async ensureOwned(customerId: string, addressId: string) {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address) throw new NotFoundException('Address not found');
    if (address.customerId !== customerId) throw new ForbiddenException('Not your address');
    return address;
  }

  async add(customerId: string, input: AddressInput, makeDefault = false) {
    const count = await this.prisma.address.count({ where: { customerId } });
    const isDefault = makeDefault || count === 0; // first address is default
    return this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      }
      return tx.address.create({ data: { ...input, customerId, isDefault } });
    });
  }

  async update(customerId: string, addressId: string, input: AddressInput, makeDefault?: boolean) {
    await this.ensureOwned(customerId, addressId);
    return this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      }
      return tx.address.update({
        where: { id: addressId },
        data: { ...input, ...(makeDefault ? { isDefault: true } : {}) },
      });
    });
  }

  async remove(customerId: string, addressId: string) {
    await this.ensureOwned(customerId, addressId);
    await this.prisma.address.delete({ where: { id: addressId } });
  }
}
