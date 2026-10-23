import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../admin/audit-log.service';

export interface ZoneView {
  id: string;
  name: string;
  isActive: boolean;
  pincodeCount: number;
  partnerCount: number;
}

export interface ZoneDetail extends ZoneView {
  pincodes: string[];
}

/** Delivery zones: sets of pincodes that partners cover (BR-D9, DL-1.5). Zones only order suggestions. */
@Injectable()
export class ZoneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  private async loadDetail(id: string): Promise<ZoneDetail> {
    const zone = await this.prisma.deliveryZone.findUnique({
      where: { id },
      include: { pincodes: { select: { pincode: true }, orderBy: { pincode: 'asc' } }, _count: { select: { partners: true } } },
    });
    if (!zone) throw new NotFoundException('Zone not found');
    return {
      id: zone.id,
      name: zone.name,
      isActive: zone.isActive,
      pincodeCount: zone.pincodes.length,
      partnerCount: zone._count.partners,
      pincodes: zone.pincodes.map((p) => p.pincode),
    };
  }

  async list(): Promise<ZoneView[]> {
    const zones = await this.prisma.deliveryZone.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { pincodes: true, partners: true } } },
    });
    return zones.map((z) => ({ id: z.id, name: z.name, isActive: z.isActive, pincodeCount: z._count.pincodes, partnerCount: z._count.partners }));
  }

  get(id: string): Promise<ZoneDetail> {
    return this.loadDetail(id);
  }

  async create(actorId: string, input: { name: string; isActive?: boolean }): Promise<ZoneDetail> {
    if (await this.prisma.deliveryZone.findUnique({ where: { name: input.name } })) {
      throw new ConflictException('A zone with this name already exists');
    }
    const zone = await this.prisma.deliveryZone.create({ data: { name: input.name, isActive: input.isActive ?? true } });
    await this.audit.record(actorId, 'delivery.zone.create', zone.id, undefined, { name: zone.name });
    return this.loadDetail(zone.id);
  }

  async update(actorId: string, id: string, input: { name?: string; isActive?: boolean }): Promise<ZoneDetail> {
    const before = await this.loadDetail(id);
    if (input.name && input.name !== before.name && (await this.prisma.deliveryZone.findUnique({ where: { name: input.name } }))) {
      throw new ConflictException('A zone with this name already exists');
    }
    await this.prisma.deliveryZone.update({ where: { id }, data: input });
    const after = await this.loadDetail(id);
    await this.audit.record(actorId, 'delivery.zone.update', id, { name: before.name, isActive: before.isActive }, { name: after.name, isActive: after.isActive });
    return after;
  }

  async remove(actorId: string, id: string): Promise<void> {
    const before = await this.loadDetail(id);
    await this.prisma.deliveryZone.delete({ where: { id } });
    await this.audit.record(actorId, 'delivery.zone.delete', id, { name: before.name, pincodes: before.pincodeCount });
  }

  /** Replace a zone's pincodes. A pincode can belong to one zone only (BR-D9), so clashes are listed. */
  async setPincodes(actorId: string, id: string, pincodes: string[]): Promise<ZoneDetail> {
    await this.loadDetail(id);
    const unique = [...new Set(pincodes)];
    const clashes = await this.prisma.deliveryZonePincode.findMany({
      where: { pincode: { in: unique }, zoneId: { not: id } },
      select: { pincode: true, zone: { select: { name: true } } },
    });
    if (clashes.length > 0) {
      const list = clashes.slice(0, 10).map((c) => `${c.pincode} (${c.zone.name})`).join(', ');
      throw new ConflictException(`These pincodes already belong to another zone: ${list}${clashes.length > 10 ? ', ...' : ''}`);
    }
    await this.prisma.$transaction([
      this.prisma.deliveryZonePincode.deleteMany({ where: { zoneId: id } }),
      this.prisma.deliveryZonePincode.createMany({ data: unique.map((pincode) => ({ zoneId: id, pincode })) }),
    ]);
    await this.audit.record(actorId, 'delivery.zone.pincodes', id, undefined, { count: unique.length });
    return this.loadDetail(id);
  }

  /** Replace the zones a partner covers. */
  async setPartnerZones(actorId: string, partnerId: string, zoneIds: string[]): Promise<string[]> {
    if (!(await this.prisma.deliveryPartner.findUnique({ where: { id: partnerId }, select: { id: true } }))) {
      throw new NotFoundException('Delivery partner not found');
    }
    const unique = [...new Set(zoneIds)];
    if (unique.length > 0 && (await this.prisma.deliveryZone.count({ where: { id: { in: unique } } })) !== unique.length) {
      throw new BadRequestException('One or more zones do not exist');
    }
    await this.prisma.$transaction([
      this.prisma.deliveryPartnerZone.deleteMany({ where: { partnerId } }),
      this.prisma.deliveryPartnerZone.createMany({ data: unique.map((zoneId) => ({ partnerId, zoneId })) }),
    ]);
    await this.audit.record(actorId, 'delivery.partner.zones', partnerId, undefined, { zoneIds: unique });
    return unique;
  }
}
