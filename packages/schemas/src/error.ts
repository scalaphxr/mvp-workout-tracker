import { z } from 'zod';

export const ERROR_CODES = [
  'validation_error',
  'invalid_code',
  'too_many_attempts',
  'rate_limited',
  'unauthorized',
  'forbidden',
  'invalid_refresh_token',
  'not_found',
  'internal',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Every non-2xx response of the API has this shape. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;
