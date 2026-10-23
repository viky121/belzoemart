import { Injectable, PipeTransform, type ArgumentMetadata } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates request payloads against a zod schema attached to the DTO class as
 * a static `zodSchema` (see createZodDto). DTOs without a schema pass through
 * untouched, so this coexists with plain types. On failure the thrown ZodError
 * is converted to a 400 by AllExceptionsFilter (SECURITY-05, SECURITY-15).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const metatype = metadata.metatype as { zodSchema?: ZodType } | undefined;
    const schema = metatype?.zodSchema;
    if (!schema) return value;
    return schema.parse(value);
  }
}
