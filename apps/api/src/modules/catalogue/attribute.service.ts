import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Attribute master (FR-8.7): e.g. Colour, Size, with their allowed values. */
@Injectable()
export class AttributeService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.attribute.findMany({ include: { values: true } });
  }

  async upsert(input: { id?: string; name: string; code: string; type?: string }) {
    if (input.id) {
      return this.prisma.attribute.update({
        where: { id: input.id },
        data: { name: input.name, type: input.type ?? 'select' },
      });
    }
    return this.prisma.attribute.create({
      data: { name: input.name, code: input.code, type: input.type ?? 'select' },
    });
  }

  addValue(attributeId: string, value: string) {
    return this.prisma.attributeValue.create({ data: { attributeId, value } });
  }
}
