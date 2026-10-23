import { z, type ZodType } from 'zod';

/**
 * Bridges zod schemas to Nest DTO classes. The generated class validates its
 * payload against the schema in a global pipe (see ZodValidationPipe) and gives
 * Swagger a concrete type. Keeps the shared zod schema as the single source of
 * truth (SECURITY-05).
 */
export function createZodDto<T extends ZodType>(schema: T) {
  class ZodDtoClass {
    static readonly zodSchema = schema;
    constructor(data: z.infer<T>) {
      Object.assign(this, data);
    }
  }
  return ZodDtoClass as unknown as {
    new (data: z.infer<T>): z.infer<T>;
    zodSchema: T;
  };
}
