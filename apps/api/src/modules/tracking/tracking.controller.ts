import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { sanitizeTracking, TRACKING_SETTING_KEY, trackingEventSchema, type TrackingItem } from '@belzo/shared';
import type { JwtPrincipal } from '../../common/auth/jwt.types';
import { Public } from '../../common/auth/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { SettingsService } from '../admin/settings.service';
import { createZodDto } from '../identity/zod-dto';
import { appTrackingEnabled, SERVER_TRACKING_KEY, serverTrackingReady } from './server-tracking';
import { TrackingForwarderService } from './tracking-forwarder.service';
import type { ServerEvent } from './tracking-payloads';

class TrackingEventDto extends createZodDto(trackingEventSchema) {}

const PURCHASE_KEY = 'trk:purchase:';
const PURCHASE_TTL = 30 * 24 * 60 * 60;

/**
 * Receives the mobile app's tracking events and forwards them to Google Analytics / Meta. Public (guests
 * browse too) but strictly validated and rate limited. A purchase is only accepted for a signed-in customer's own
 * order, its amount comes from the order (not from the app), and each order is counted once.
 */
@ApiTags('tracking')
@Controller('tracking')
export class TrackingController {
  constructor(
    private readonly settings: SettingsService,
    private readonly forwarder: TrackingForwarderService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(202)
  @Post('events')
  async event(@Body() dto: TrackingEventDto, @Req() req: Request): Promise<{ accepted: boolean }> {
    // Nothing to do (and no work done) until the admin has set an ID and a server-side secret.
    const [pub, stored] = await Promise.all([
      this.settings.get<unknown>(TRACKING_SETTING_KEY),
      this.settings.get<unknown>(SERVER_TRACKING_KEY),
    ]);
    if (!appTrackingEnabled(serverTrackingReady(sanitizeTracking(pub), stored))) return { accepted: false };

    const customerId = await this.customerId(req);
    let items: TrackingItem[] = dto.items ?? [];
    let valuePaise = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    let eventId: string = randomUUID();

    if (dto.event === 'purchase') {
      const order = customerId && dto.orderId ? await this.ownPaidOrder(dto.orderId, customerId) : null;
      if (!order) return { accepted: false };
      // Counted once per order, even if the confirmation screen is opened again.
      const key = `${PURCHASE_KEY}${order.id}`;
      if (await this.redis.getJson<boolean>(key)) return { accepted: false };
      await this.redis.setJson(key, true, PURCHASE_TTL);
      items = [];
      valuePaise = order.grandTotal;
      eventId = order.id;
    }

    const ev: ServerEvent = {
      name: dto.event,
      clientId: dto.clientId,
      eventId,
      timeSec: Math.floor(Date.now() / 1000),
      items,
      valuePaise,
      orderId: dto.event === 'purchase' ? dto.orderId : undefined,
      customer: customerId ? await this.customer(customerId) : undefined,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
    // Reply now; the forwarding (and its timeouts) must never slow the app down.
    void this.forwarder.forward(ev);
    return { accepted: true };
  }

  /** The signed-in customer's id from an optional bearer token; null for guests and bad tokens. */
  private async customerId(req: Request): Promise<string | null> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    try {
      const p = await this.jwt.verifyAsync<JwtPrincipal>(header.slice(7), { secret: process.env.JWT_ACCESS_SECRET });
      return p.kind === 'customer' ? p.sub : null;
    } catch {
      return null;
    }
  }

  private async customer(id: string): Promise<ServerEvent['customer']> {
    const c = await this.prisma.customer.findUnique({ where: { id }, select: { id: true, email: true, phone: true } });
    return c ?? { id };
  }

  /** The order, if it is this customer's and counts as a sale: paid, or placed as Cash on Delivery. */
  private async ownPaidOrder(orderId: string, customerId: string): Promise<{ id: string; grandTotal: number } | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, status: true, grandTotal: true, payments: { select: { provider: true }, take: 1 } },
    });
    if (!order || order.customerId !== customerId || order.status === 'cancelled') return null;
    if (order.status === 'pending' && order.payments[0]?.provider !== 'cod') return null; // still awaiting payment
    return { id: order.id, grandTotal: order.grandTotal };
  }
}
