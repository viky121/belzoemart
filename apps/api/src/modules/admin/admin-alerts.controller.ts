import { BadRequestException, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ADMIN_ALERTS_SETTING_KEY, sanitizeAdminAlerts, type AdminAlertsConfig } from '@belzo/shared';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { EMAIL_PROVIDER, type EmailProvider } from '../../integrations/notifications/channels';
import { adminAlertTestEmail } from '../../integrations/notifications/email-templates';
import { resolveAdminAlertRecipients } from '../engagement/admin-alerts';
import { SettingsService } from './settings.service';

/**
 * Admin: order alert emails (Settings → Order alerts). The settings themselves are saved through PUT /admin/settings;
 * this shows where the alerts go right now (including the default address) and sends a test email.
 */
@ApiTags('admin-alerts')
@ApiBearerAuth()
@RequirePermission('settings.edit')
@Controller('admin/notifications/order-alerts')
export class AdminAlertsController {
  constructor(
    private readonly settings: SettingsService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  private async config(): Promise<AdminAlertsConfig> {
    return sanitizeAdminAlerts(await this.settings.get<unknown>(ADMIN_ALERTS_SETTING_KEY));
  }

  /** The saved settings plus the addresses alerts actually go to (the default when none is saved). */
  @Get()
  async status() {
    const config = await this.config();
    return {
      config,
      recipients: resolveAdminAlertRecipients(config),
      usingDefault: config.emails.length === 0,
      emailLive: process.env.EMAIL_PROVIDER === 'live',
    };
  }

  /** Send one test email to the current recipients. Limited to 3 a minute. */
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('test')
  @HttpCode(200)
  async test() {
    const to = resolveAdminAlertRecipients(await this.config());
    if (to.length === 0) throw new BadRequestException('No address is set for order alerts yet.');
    if (process.env.EMAIL_PROVIDER !== 'live') {
      throw new BadRequestException('Email sending is not switched on for this server (EMAIL_PROVIDER is not live).');
    }
    const mail = adminAlertTestEmail(to);
    try {
      await this.email.send({ to: to.join(', '), subject: mail.subject, html: mail.html });
    } catch (e) {
      throw new BadRequestException(`The email could not be sent: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
    return { sentTo: to };
  }
}
