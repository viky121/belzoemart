import { Injectable, Logger } from '@nestjs/common';
import { ResilientHttpService } from '../../common/http/resilient-http.service';
import { buildGa4Request, buildMetaRequest, type ServerEvent } from './tracking-payloads';
import { TrackingSettingsService } from './tracking-settings.service';

/**
 * Sends one mobile app event to Google Analytics 4 (Measurement Protocol) and to Meta (Conversions API),
 * for each channel whose ID and server-side secret are both set. It never throws: tracking must not
 * affect the app. Failures are logged without the URL or any secret.
 */
@Injectable()
export class TrackingForwarderService {
  private readonly logger = new Logger(TrackingForwarderService.name);

  constructor(
    private readonly settings: TrackingSettingsService,
    private readonly http: ResilientHttpService,
  ) {}

  async forward(ev: ServerEvent): Promise<void> {
    try {
      const rt = await this.settings.runtime();
      const jobs: Promise<unknown>[] = [];
      if (rt.config.ga4Id && rt.ga4ApiSecret) {
        const { url, body } = buildGa4Request(rt.config.ga4Id, rt.ga4ApiSecret, ev);
        jobs.push(this.send('ga4-measurement-protocol', url, body));
      }
      if (rt.config.metaPixelId && rt.metaAccessToken) {
        const { url, body } = buildMetaRequest(rt.config.metaPixelId, rt.metaAccessToken, ev, rt.metaTestEventCode);
        jobs.push(this.send('meta-conversions-api', url, body));
      }
      await Promise.all(jobs);
    } catch (e) {
      this.logger.warn(`Could not forward tracking event ${ev.name}: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  private async send(dependency: string, url: string, body: unknown): Promise<void> {
    try {
      await this.http.request(dependency, url, { method: 'POST', body, timeoutMs: 5000 });
    } catch (e) {
      // The message is "<dependency> responded <status>" or a timeout / open-circuit notice: no URL, no secret.
      this.logger.warn(`Tracking forward to ${dependency} failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }
}
