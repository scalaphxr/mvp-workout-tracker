import type { ErrorCode } from '@mvp/schemas';
import type { Context } from 'hono';
import { z } from 'zod';

/** Thrown anywhere in a request; `app.onError` turns it into the error envelope. */
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 429,
    readonly code: ErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const rateLimited = (retryAfterSec: number) =>
  new ApiError(429, 'rate_limited', `Too many requests, retry in ${retryAfterSec} s`, {
    'Retry-After': String(retryAfterSec),
  });

export async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  const json: unknown = await c.req.json().catch(() => undefined);
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError(400, 'validation_error', z.prettifyError(result.error));
  }
  return result.data;
}
