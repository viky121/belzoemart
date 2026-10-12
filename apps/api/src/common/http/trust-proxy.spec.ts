import { Controller, Get, Req } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import request from 'supertest';
import { configureTrustProxy, TRUSTED_PROXY_HOPS } from './trust-proxy';

@Controller()
class IpController {
  @Get('ip')
  ip(@Req() req: Request): string {
    return req.ip ?? '';
  }
}

async function makeApp(trustProxy: boolean): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1 }])],
    controllers: [IpController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  if (trustProxy) configureTrustProxy(app);
  await app.init();
  return app;
}

describe('configureTrustProxy (A3)', () => {
  it('trusts exactly one hop', () => {
    expect(TRUSTED_PROXY_HOPS).toBe(1);
  });

  describe('with trust proxy', () => {
    let app: NestExpressApplication;
    beforeAll(async () => {
      app = await makeApp(true);
    });
    afterAll(async () => {
      await app.close();
    });

    it('uses the forwarded client IP and throttles per client', async () => {
      const server = app.getHttpServer();

      const first = await request(server).get('/ip').set('X-Forwarded-For', '203.0.113.1');
      expect(first.status).toBe(200);
      expect(first.text).toBe('203.0.113.1');

      const again = await request(server).get('/ip').set('X-Forwarded-For', '203.0.113.1');
      expect(again.status).toBe(429);
      expect(again.headers['retry-after']).toBeDefined();

      const other = await request(server).get('/ip').set('X-Forwarded-For', '203.0.113.2');
      expect(other.status).toBe(200);
      expect(other.text).toBe('203.0.113.2');

      const chain = await request(server)
        .get('/ip')
        .set('X-Forwarded-For', '198.51.100.7, 203.0.113.9');
      expect(chain.status).toBe(200);
      expect(chain.text).toBe('203.0.113.9');
    });
  });

  describe('control: without trust proxy', () => {
    let app: NestExpressApplication;
    beforeAll(async () => {
      app = await makeApp(false);
    });
    afterAll(async () => {
      await app.close();
    });

    it('all clients behind the proxy share one bucket (the bug being fixed)', async () => {
      const server = app.getHttpServer();
      const a = await request(server).get('/ip').set('X-Forwarded-For', '203.0.113.1');
      expect(a.status).toBe(200);
      const b = await request(server).get('/ip').set('X-Forwarded-For', '203.0.113.2');
      expect(b.status).toBe(429);
    });
  });
});
