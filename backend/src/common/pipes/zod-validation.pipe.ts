import { BadRequestException, Body, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) {
      return parsed.data;
    }

    throw new BadRequestException(
      parsed.error.issues.map((issue) => issue.message),
    );
  }
}

export function ZodBody(schema: ZodType) {
  return Body(new ZodValidationPipe(schema));
}
