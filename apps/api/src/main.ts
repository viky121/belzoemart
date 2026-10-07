import 'reflect-metadata';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { validateEnv } from './common/config/env.schema';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';

async function bootstrap(): Promise<void> {
  const env = validateEnv(process.env as Record<string, unknown>);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true, // capture raw body for payment webhook signature verification
  });

  // Structured logging (SECURITY-03)
  app.useLogger(app.get(Logger));

  // Security headers (SECURITY-04)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      hsts: { maxAge: 31_536_000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Restrictive CORS allowlist (SECURITY-08)
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  // Parse cookies (refresh-token cookie handling)
  app.use(cookieParser());

  // Limit request body size (SECURITY-05)
  app.useBodyParser('json', { limit: '1mb' });

  // Global input validation (SECURITY-05). All DTOs are backed by shared zod
  // schemas validated here. (We intentionally do NOT add Nest's class-validator
  // ValidationPipe: with whitelist it would strip our zod DTO fields, since they
  // carry no class-validator decorators.)
  app.useGlobalPipes(new ZodValidationPipe());

  // Global fail-closed error handling (SECURITY-15)
  app.useGlobalFilters(new AllExceptionsFilter());

  // Serve locally-stored uploads at /api/uploads/* (the reverse proxy routes
  // /api/* to this service). No-op in practice when STORAGE_PROVIDER=s3.
  // Invoices are overwritten in place on regenerate (no-cache) and carry a
  // single constant inline handler for the Print button; every interpolated
  // value in them is HTML-escaped. Only /invoices/ files get this policy.
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/api/uploads',
    setHeaders: (res, filePath) => {
      if (!filePath.replace(/\\/g, '/').includes('/invoices/')) return;
      res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; script-src-attr 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      );
    },
  });

  // API versioning: /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // OpenAPI docs (deliverable requirement)
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Belzo eMart API')
    .setDescription('REST API for the Belzo eMart storefront + admin panel')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
}

void bootstrap();
