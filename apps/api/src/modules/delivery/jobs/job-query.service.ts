import { Injectable } from '@nestjs/common';
import type { DeliveryJob, Prisma } from '@prisma/client';
import {
  DELIVERY_ACTIVE_STATUSES,
  DELIVERY_STATUSES,
  maskMobile,
  type AdminJobDetail,
  type AdminJobEvent,
  type AdminJobRow,
  type AdminJobsQuery,
  type DeliveryDashboard,
  type DeliverySettings,
  type DeliveryStatus,
  type PartnerJobView,
  type PartnerJobsQuery,
  type PartnerSuggestion,
} from '@belzo/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DeliveryError } from '../delivery-errors';
import { DeliveryOtpService } from '../otp/delivery-otp.service';
import { PartnerService } from '../partners/partner.service';
import { DeliverySecurityEvents, SECURITY_EVENTS } from '../security-events';
import { DeliverySettingsService } from '../settings/delivery-settings.service';
import { toAdminRow, toPartnerDetail, toPartnerPreview, type PartnerLite } from './job-view';
import { JobRepository } from './job.repository';
import { ASSIGNABLE_ORDER_STATUSES } from './job.service';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AssignOptions {
  order: {
    id: string;
    status: string;
    grandTotal: number;
    paymentMode: 'cod' | 'prepaid';
    city: string | null;
    pincode: string | null;
    assignable: boolean;
    reason: string | null;
  };
  activeJob: { id: string; code: string; status: DeliveryStatus } | null;
  suggestions: PartnerSuggestion[];
}

/** Read side of delivery jobs (component C4): what partners and staff see. */
@Injectable()
export class JobQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: JobRepository,
    private readonly settings: DeliverySettingsService,
    private readonly otp: DeliveryOtpService,
    private readonly partners: PartnerService,
    private readonly security: DeliverySecurityEvents,
  ) {}

  // ───────────────────────── partner side ─────────────────────────

  /** The partner's own jobs, active first or history (BR-D73). Before Accept only the preview is returned (BR-D70). */
  async partnerList(partnerId: string, query: PartnerJobsQuery): Promise<Paged<PartnerJobView>> {
    const now = await this.repo.now(this.prisma);
    const settings = await this.settings.get();
    const { rows, total } = await this.repo.listForPartner(this.prisma, partnerId, query.scope, query.page, query.pageSize, now);
    const itemsByOrder = await this.itemsFor(rows.filter((r) => r.status !== 'assigned').map((r) => r.orderId));
    const items: PartnerJobView[] = [];
    for (const job of rows) items.push(await this.partnerView(job, now, settings, itemsByOrder.get(job.orderId) ?? []));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** One job, only if it is the partner's (BR-D72); anything else is a 404 and a security event. */
  async partnerGet(partnerId: string, jobId: string): Promise<PartnerJobView> {
    const now = await this.repo.now(this.prisma);
    const job = await this.repo.findForPartner(this.prisma, partnerId, jobId, now);
    if (!job) {
      await this.security.record(SECURITY_EVENTS.ACCESS_DENIED, { partnerId, jobId, action: 'job.read' });
      throw new DeliveryError(404, 'NOT_FOUND', 'Delivery not found');
    }
    const settings = await this.settings.get();
    const items = await this.itemsFor([job.orderId]);
    return this.partnerView(job, now, settings, items.get(job.orderId) ?? []);
  }

  private async partnerView(job: DeliveryJob, now: Date, settings: DeliverySettings, items: { title: string; quantity: number }[]): Promise<PartnerJobView> {
    if (job.status === 'assigned') return toPartnerPreview(job);
    const step = await this.otp.stepView(this.prisma, job, now, settings);
    const verifiedAt = step.verified ? await this.otp.latestVerifiedAt(this.prisma, job) : null;
    return toPartnerDetail(job, items, step, this.otp.isFresh(verifiedAt, now, settings));
  }

  private async itemsFor(orderIds: string[]): Promise<Map<string, { title: string; quantity: number }[]>> {
    const map = new Map<string, { title: string; quantity: number }[]>();
    const unique = [...new Set(orderIds)];
    if (unique.length === 0) return map;
    const rows = await this.prisma.orderItem.findMany({ where: { orderId: { in: unique } }, select: { orderId: true, title: true, quantity: true } });
    for (const r of rows) map.set(r.orderId, [...(map.get(r.orderId) ?? []), { title: r.title, quantity: r.quantity }]);
    return map;
  }

  // ───────────────────────── admin side ─────────────────────────

  async adminList(query: AdminJobsQuery): Promise<Paged<AdminJobRow>> {
    const q = query.q?.trim();
    const where: Prisma.DeliveryJobWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.partnerId ? { partnerId: query.partnerId } : {}),
      ...(query.attention ? { attention: query.attention } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q.toUpperCase() } },
              { destName: { contains: q, mode: 'insensitive' } },
              { destCity: { contains: q, mode: 'insensitive' } },
              { destPincode: { contains: q } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.deliveryJob.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.deliveryJob.count({ where }),
    ]);
    const partners = await this.partnersById(rows.map((r) => r.partnerId));
    return { items: rows.map((r) => toAdminRow(r, r.partnerId ? partners.get(r.partnerId) : undefined)), total, page: query.page, pageSize: query.pageSize };
  }

  /** Full detail with the event log. Numbers are masked in lists; the detail page shows masked numbers too (SP7). */
  async adminGet(jobId: string): Promise<AdminJobDetail> {
    const job = await this.prisma.deliveryJob.findUnique({ where: { id: jobId } });
    if (!job) throw new DeliveryError(404, 'NOT_FOUND', 'Delivery not found');
    const [partners, events] = await Promise.all([
      this.partnersById([job.partnerId]),
      this.prisma.deliveryEvent.findMany({ where: { jobId }, orderBy: { createdAt: 'asc' } }),
    ]);
    const row = toAdminRow(job, job.partnerId ? partners.get(job.partnerId) : undefined);
    const mapped: AdminJobEvent[] = events.map((e) => ({
      id: e.id,
      event: e.event,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actorKind: e.actorKind,
      actorId: e.actorId,
      reasonCode: e.reasonCode,
      note: e.note,
      attemptNo: e.attemptNo,
      createdAt: e.createdAt.toISOString(),
    }));
    return {
      ...row,
      destName: job.destName,
      destPhoneMasked: maskMobile(job.destPhone),
      otpPhoneMasked: maskMobile(job.otpPhone),
      address: { line1: job.destLine1, line2: job.destLine2, city: job.destCity, state: job.destState, pincode: job.destPincode },
      otpLockedUntil: job.otpLockedUntil?.toISOString() ?? null,
      trackingToken: job.trackingToken,
      events: mapped,
    };
  }

  /** Dashboard: counts per status, jobs that need attention, and the security numbers of the last 24 hours. */
  async dashboard(): Promise<DeliveryDashboard> {
    const counts = Object.fromEntries(
      await Promise.all(DELIVERY_STATUSES.map(async (s) => [s, await this.prisma.deliveryJob.count({ where: { status: s } })] as const)),
    ) as Record<DeliveryStatus, number>;
    const attentionJobs = await this.prisma.deliveryJob.findMany({
      where: { attention: { not: null }, status: { in: ['new', ...DELIVERY_ACTIVE_STATUSES] as DeliveryStatus[] } },
      orderBy: { updatedAt: 'asc' },
      take: 50,
    });
    const partners = await this.partnersById(attentionJobs.map((j) => j.partnerId));
    return {
      counts,
      attention: attentionJobs.map((j) => toAdminRow(j, j.partnerId ? partners.get(j.partnerId) : undefined)),
      security: await this.security.counters24h(),
    };
  }

  /** What the "Assign delivery" dialog on an order needs (DL-2.1, BR-D13). */
  async assignOptions(orderId: string): Promise<AssignOptions> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
    if (!order) throw new DeliveryError(404, 'NOT_FOUND', 'Order not found');
    const address = await this.prisma.address.findUnique({ where: { id: order.addressId } });
    const active = await this.repo.findActiveByOrder(this.prisma, orderId);

    let reason: string | null = null;
    if (!(ASSIGNABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      reason = order.status === 'pending' ? 'Confirm the order first' : `An order that is ${order.status.replace(/_/g, ' ')} cannot be assigned`;
    } else if (active && active.status !== 'new') {
      reason = 'This order is already with a delivery partner';
    }
    return {
      order: {
        id: order.id,
        status: order.status,
        grandTotal: order.grandTotal,
        paymentMode: order.payments.some((p) => p.provider === 'cod') ? 'cod' : 'prepaid',
        city: address?.city ?? null,
        pincode: address?.pincode ?? null,
        assignable: reason === null,
        reason,
      },
      activeJob: active ? { id: active.id, code: active.code, status: active.status } : null,
      suggestions: address ? await this.partners.suggestFor(address.pincode) : [],
    };
  }

  private async partnersById(ids: (string | null)[]): Promise<Map<string, PartnerLite>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.deliveryPartner.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, isActive: true } });
    return new Map(rows.map((p) => [p.id, p]));
  }
}
