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

    response.status(status).json({
      statusCode: status,
      error,
      message,
      correlationId,
    });
  }
}
