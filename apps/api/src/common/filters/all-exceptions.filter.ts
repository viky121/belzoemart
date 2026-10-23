import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

/** `code` and `details` of an HttpException whose body is an object with a string `code`; nothing otherwise. */
export function structuredFields(exception: unknown): { code?: string; details?: Record<string, unknown> } {
  if (!(exception instanceof HttpException)) return {};
  const res = exception.getResponse();
  if (!res || typeof res !== 'object' || Array.isArray(res)) return {};
  const { code, statusCode: _s, error: _e, message: _m, ...rest } = res as Record<string, unknown>;
  if (typeof code !== 'string') return {};
  return Object.keys(rest).length > 0 ? { code, details: rest } : { code };
}

/**
 * Global exception filter — fail closed (SECURITY-15).
 *
 * - Catches every error so nothing leaks an unhandled stack trace.
 * - Returns a generic, structured message to clients (no internal details).
 * - Logs the full error server-side with the request correlation ID.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const correlationId = request.id;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      error = 'ValidationError';
      message = exception.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      error = exception.name;
      message =
        typeof res === 'string'
          ? res
          : ((res as { message?: string | string[] }).message as string) ?? exception.message;
      if (Array.isArray(message)) message = message.join('; ');
    }

    // Log full detail server-side only.
    if (status >= 500) {
      this.logger.error(
        { correlationId, err: exception, path: request.url },
        'Unhandled exception',
      );
      // For 5xx never expose the underlying message to the client, except 503 "service unavailable":
      // those are raised on purpose with a generic, customer-safe sentence (e.g. the OTP SMS could not be sent).
      if (!(exception instanceof ServiceUnavailableException)) message = 'Internal server error';
    } else {
      this.logger.warn({ correlationId, path: request.url, status, error }, message);
    }

    // Our own structured errors (the delivery module) carry a stable `code` the apps act on, plus a few
    // plain details such as how many seconds to wait. Other responses are unchanged.
    const structured = status < 500 ? structuredFields(exception) : {};
    response.status(status).json({
      statusCode: status,
      error,
      message,
      ...structured,
      correlationId,
    });
  }
}
