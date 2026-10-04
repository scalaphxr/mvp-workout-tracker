import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32).optional(),
  SMTP_URL: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).default('MVP <no-reply@localhost>'),
});

export interface Config {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  /** Without it login codes go to the console instead of email. */
  smtpUrl: string | undefined;
  mailFrom: string;
}

const DEV_DATABASE_URL = 'pglite://.data/pglite';
const DEV_JWT_SECRET = 'dev-only-secret-do-not-use-in-production';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);

  if (parsed.NODE_ENV === 'production') {
    const missing = (['DATABASE_URL', 'JWT_SECRET', 'SMTP_URL'] as const).filter(
      (name) => !parsed[name],
    );
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  return {
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL ?? DEV_DATABASE_URL,
    jwtSecret: parsed.JWT_SECRET ?? DEV_JWT_SECRET,
    smtpUrl: parsed.SMTP_URL,
    mailFrom: parsed.MAIL_FROM,
  };
}
