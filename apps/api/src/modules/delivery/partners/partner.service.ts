import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { DeliveryPartner } from '@prisma/client';
import {
  deliveryPasswordProblems,
  type AdminPartnersQuery,
  type CreatePartnerInput,
  type DeliveryLocation,
  type PartnerSuggestion,
  type PartnerView,
  type UpdatePartnerInput,
} from '@belzo/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../admin/audit-log.service';
import { PasswordService } from '../../identity/password.service';
import { JobRepository } from '../jobs/job.repository';
import { DeliverySettingsService } from '../settings/delivery-settings.service';
import { PartnerTokenService } from './partner-token.service';
import { hasCapacity, rankSuggestions } from './suggestions';

type PartnerWithZones = DeliveryPartner & { zones: { zoneId: string }[] };

/**
 * Partner accounts for admins, plus the partner's own presence (component C1, BR-D1 to BR-D9,
 * BR-D13). Passwords and hashes never appear in a view or in the audit log.
 */
@Injectable()
export class PartnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditLogService,
    private readonly tokens: PartnerTokenService,
    private readonly jobs: JobRepository,
    private readonly settings: DeliverySettingsService,
  ) {}

  toView(p: PartnerWithZones, activeJobs: number): PartnerView {
    return {
      id: p.id,
      name: p.name,
      mobile: p.mobile,
      email: p.email,
      vehicleType: p.vehicleType,
      vehicleNumber: p.vehicleNumber,
      isActive: p.isActive,
      isOnline: p.isOnline,
      lastSeenAt: p.lastSeenAt?.toISOString() ?? null,
      maxActiveJobs: p.maxActiveJobs,
      activeJobs,
      zoneIds: p.zones.map((z) => z.zoneId),
      mustChangePassword: p.mustChangePassword,
      createdAt: p.createdAt.toISOString(),
    };
  }

  private async load(id: string): Promise<PartnerWithZones> {
    const partner = await this.prisma.deliveryPartner.findUnique({ where: { id }, include: { zones: { select: { zoneId: true } } } });
    if (!partner) throw new NotFoundException('Delivery partner not found');
    return partner;
  }

  private async assertZonesExist(zoneIds: string[]): Promise<void> {
    if (zoneIds.length === 0) return;
    const found = await this.prisma.deliveryZone.count({ where: { id: { in: zoneIds } } });
    if (found !== new Set(zoneIds).size) throw new BadRequestException('One or more zones do not exist');
  }

  async get(id: string): Promise<PartnerView> {
    const partner = await this.load(id);
    return this.toView(partner, await this.jobs.countActiveForPartner(this.prisma, id));
  }

  async create(actorId: string, input: CreatePartnerInput): Promise<PartnerView> {
    if (await this.prisma.deliveryPartner.findUnique({ where: { mobile: input.mobile } })) {
      throw new ConflictException('A delivery partner with this mobile number already exists');
    }
    await this.assertZonesExist(input.zoneIds ?? []);
    const settings = await this.settings.get();
    const created = await this.prisma.deliveryPartner.create({
      data: {
        name: input.name,
        mobile: input.mobile,
        email: input.email ?? null,
        vehicleType: input.vehicleType ?? null,
        vehicleNumber: input.vehicleNumber ?? null,
        passwordHash: await this.passwords.hash(input.password),
        mustChangePassword: true,
        maxActiveJobs: input.maxActiveJobs ?? settings.defaultMaxActiveJobs,
        createdById: actorId,
        zones: { create: [...new Set(input.zoneIds ?? [])].map((zoneId) => ({ zoneId })) },
      },
      include: { zones: { select: { zoneId: true } } },
    });
    const view = this.toView(created, 0);
    await this.audit.record(actorId, 'delivery.partner.create', created.id, undefined, view);
    return view;
  }

  async update(actorId: string, id: string, input: UpdatePartnerInput): Promise<PartnerView> {
    const before = await this.load(id);
    if (input.zoneIds) await this.assertZonesExist(input.zoneIds);
    const { zoneIds, ...fields } = input;
    const after = await this.prisma.$transaction(async (tx) => {
      if (zoneIds) {
        await tx.deliveryPartnerZone.deleteMany({ where: { partnerId: id } });
        await tx.deliveryPartnerZone.createMany({ data: [...new Set(zoneIds)].map((zoneId) => ({ partnerId: id, zoneId })) });
      }
      return tx.deliveryPartner.update({
        where: { id },
        data: fields,
        include: { zones: { select: { zoneId: true } } },
      });
    });
    const active = await this.jobs.countActiveForPartner(this.prisma, id);
    const view = this.toView(after, active);
    await this.audit.record(actorId, 'delivery.partner.update', id, this.toView(before, active), view);
    return view;
  }

  /** Deactivate or reactivate. Deactivating signs the partner out everywhere and takes them offline. */
  async setActive(actorId: string, id: string, active: boolean): Promise<PartnerView> {
    const before = await this.load(id);
    const after = await this.prisma.deliveryPartner.update({
      where: { id },
      data: active ? { isActive: true } : { isActive: false, isOnline: false },
      include: { zones: { select: { zoneId: true } } },
    });
    if (!active) await this.tokens.revokeAllFor(id);
    const activeJobs = await this.jobs.countActiveForPartner(this.prisma, id);
    await this.audit.record(actorId, active ? 'delivery.partner.activate' : 'delivery.partner.deactivate', id, { isActive: before.isActive }, { isActive: after.isActive });
    return this.toView(after, activeJobs);
  }

  /** Admin sets a new password; the partner must change it at the next login and is signed out everywhere. */
  async resetPassword(actorId: string, id: string, password: string): Promise<void> {
    const partner = await this.load(id);
    const problems = deliveryPasswordProblems(password, partner.mobile);
    if (problems.length > 0) throw new BadRequestException(problems.join('. '));
    await this.prisma.deliveryPartner.update({
      where: { id },
      data: { passwordHash: await this.passwords.hash(password), mustChangePassword: true },
    });
    await this.tokens.revokeAllFor(id);
    await this.audit.record(actorId, 'delivery.partner.reset_password', id);
  }

  async list(query: AdminPartnersQuery): Promise<{ items: PartnerView[]; total: number; page: number; pageSize: number }> {
    const where = {
      ...(query.active !== undefined ? { isActive: query.active } : {}),
      ...(query.zoneId ? { zones: { some: { zoneId: query.zoneId } } } : {}),
      ...(query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' as const } }, { mobile: { contains: query.q.replace(/\D/g, '') || '__none__' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.deliveryPartner.findMany({
        where,
        include: { zones: { select: { zoneId: true } } },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.deliveryPartner.count({ where }),
    ]);
    const counts = await this.jobs.countActiveByPartner(this.prisma, rows.map((r) => r.id));
    return { items: rows.map((r) => this.toView(r, counts.get(r.id) ?? 0)), total, page: query.page, pageSize: query.pageSize };
  }

  /** Active partners with free capacity, best first (BR-D13). Anyone active can still be chosen by hand within capacity. */
  async suggestFor(pincode: string): Promise<PartnerSuggestion[]> {
    const zone = await this.prisma.deliveryZonePincode.findUnique({ where: { pincode }, select: { zoneId: true } });
    const partners = await this.prisma.deliveryPartner.findMany({
      where: { isActive: true },
      include: { zones: { select: { zoneId: true } } },
    });
    const counts = await this.jobs.countActiveByPartner(this.prisma, partners.map((p) => p.id));
    const all: PartnerSuggestion[] = partners.map((p) => ({
      partnerId: p.id,
      name: p.name,
      isOnline: p.isOnline,
      activeJobs: counts.get(p.id) ?? 0,
      maxActiveJobs: p.maxActiveJobs,
      zoneMatch: zone ? p.zones.some((z) => z.zoneId === zone.zoneId) : false,
    }));
    return rankSuggestions(all.filter(hasCapacity));
  }

  // ----- the partner's own presence (partner API) -----

  async setOnline(partnerId: string, online: boolean): Promise<void> {
    await this.prisma.deliveryPartner.update({ where: { id: partnerId }, data: { isOnline: online, lastSeenAt: new Date() } });
  }

  /** Update "last seen" and the last known position of an online partner. Offline partners are left alone. */
  async heartbeat(partnerId: string, location?: DeliveryLocation): Promise<void> {
    await this.prisma.deliveryPartner.updateMany({
      where: { id: partnerId, isOnline: true },
      data: { lastSeenAt: new Date(), ...(location ? { lastLat: location.lat, lastLng: location.lng } : {}) },
    });
  }

  async me(partnerId: string): Promise<PartnerView> {
    return this.get(partnerId);
  }

  /** Worker: set partners offline when they have not been heard from for `minutes` (BR-D8). */
  async markStaleOffline(now: Date, minutes: number): Promise<number> {
    const cutoff = new Date(now.getTime() - minutes * 60_000);
    const r = await this.prisma.deliveryPartner.updateMany({
      where: { isOnline: true, lastSeenAt: { lt: cutoff } },
      data: { isOnline: false },
    });
    return r.count;
  }
}
