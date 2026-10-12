import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

/**
 * Structured logging with correlation IDs (SECURITY-03). Secrets/PII are
 * redacted. Correlation ID is taken from an inbound header or generated.
 */
@Global()
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req) =>
          (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID(),
        customProps: (req) => ({ correlationId: (req as { id?: string }).id }),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.mfaCode',
            'req.body.code',
            'req.body.refreshToken',
            'res.headers["set-cookie"]',
            '*.password',
            '*.token',
            '*.accessToken',
            '*.refreshToken',
          ],
          censor: '[REDACTED]',
        },
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
  ],
})
export class AppLoggerModule {}
