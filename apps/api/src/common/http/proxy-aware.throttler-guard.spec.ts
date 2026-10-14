import { Controller, Get } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { configureTrustProxy } from './trust-proxy';
import { ProxyAwareThrottlerGuard } from './proxy-aware.throttler-guard';

@Controller()
class PingController {
  @Get('ping')
  ping(): string {
    return 'ok';
  }
}

async function makeApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1 }])],
    controllers: [PingController],
    providers: [{ provide: APP_GUARD, useClass: ProxyAwareThrottlerGuard }],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureTrustProxy(app);
  await app.init();
  return app;
}

describe('ProxyAwareThrottlerGuard', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('throttles proxied traffic per forwarded client IP', async () => {
    const server = app.getHttpServer();
    const first = await request(server).get('/ping').set('X-Forwarded-For', '203.0.113.1');
    expect(first.status).toBe(200);
    const again = await request(server).get('/ping').set('X-Forwarded-For', '203.0.113.1');
    expect(again.status).toBe(429);
  });

  it('does NOT throttle internal traffic that lacks X-Forwarded-For', async () => {
    const server = app.getHttpServer();
    // Simulates SSR / worker calls hitting api:4000 directly (no proxy header).
    for (let i = 0; i < 5; i += 1) {
      const res = await request(server).get('/ping');
      expect(res.status).toBe(200);
    }
  });
});
