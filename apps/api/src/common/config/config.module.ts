import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv, type Env } from './env.schema';

/**
 * Global typed configuration. Wraps @nestjs/config with zod validation so that
 * a bad environment stops the process at boot rather than failing at runtime.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (raw) => validateEnv(raw),
    }),
  ],
  providers: [
    {
      provide: 'ENV',
      inject: [ConfigService],
      useFactory: (config: ConfigService): Env => {
        // ConfigService holds the validated object; re-read typed values.
        return validateEnv(process.env as Record<string, unknown>);
      },
    },
  ],
  exports: ['ENV'],
})
export class AppConfigModule {}
