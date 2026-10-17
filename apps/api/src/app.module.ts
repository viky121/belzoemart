import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ProxyAwareThrottlerGuard } from './common/http/proxy-aware.throttler-guard';
import { AppConfigModule } from './common/config/config.module';
import { AppLoggerModule } from './common/logger/logger.module';
import { AuthModule } from './common/auth/auth.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { QueueModule } from './common/queue/queue.module';
import { HttpModule } from './common/http/http.module';
import { HealthModule } from './common/health/health.module';
import { I18nModule } from './common/i18n/i18n.module';
import { SmsModule } from './integrations/sms/sms.module';
import { StorageModule } from './integrations/storage/storage.module';
import { IdentityModule } from './modules/identity/identity.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { PaymentModule } from './integrations/payment/payment.module';
import { ShippingModule } from './integrations/shipping/shipping.module';
import { CartCheckoutModule } from './modules/checkout/cart-checkout.module';
import { PaymentGatewayModule } from './modules/payment-gateway/payment-gateway.module';
import { OrdersModule } from './modules/orders/orders.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { NotificationsIntegrationModule } from './integrations/notifications/notifications-integration.module';
import { AdminModule } from './modules/admin/admin.module';
import { MediaModule } from './modules/media/media.module';

/**
 * Root application module. Composes the platform-core cross-cutting modules.
 * Domain feature modules (identity, catalogue, cart, ...) are added by their
 * respective units (U2–U7).
 */
@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    // Global rate limiting (SECURITY-11): 100 requests / 60s per IP by default.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    HttpModule,
    HealthModule,
    I18nModule,
    SmsModule,
    StorageModule,
    PaymentModule,
    ShippingModule,
    NotificationsIntegrationModule,
    IdentityModule,
    CatalogueModule,
    CartCheckoutModule,
    PaymentGatewayModule,
    OrdersModule,
    EngagementModule,
    AdminModule,
    MediaModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ProxyAwareThrottlerGuard }],
})
export class AppModule {}
