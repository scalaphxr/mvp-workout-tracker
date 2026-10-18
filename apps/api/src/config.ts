import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32).optional(),
  ADMIN_TOKEN: z.string().min(16).optional(),
  SMTP_URL: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).default('MVP <no-reply@localhost>'),
  SUPPORT_EMAIL: z.email().optional(),
});

export interface Config {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  /** Secret of the admin endpoints (catalog import). In production they are closed without it. */
  adminToken: string | undefined;
  /** Without it login codes go to the console instead of email. */
  smtpUrl: string | undefined;
  mailFrom: string;
  /** Where messages of the support form are sent on; they are kept in the database either way. */
  supportEmail: string | undefined;
}

const DEV_DATABASE_URL = 'pglite://.data/pglite';
const DEV_JWT_SECRET = 'dev-only-secret-do-not-use-in-production';
const DEV_ADMIN_TOKEN = 'dev-admin-token';

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
    adminToken:
      parsed.ADMIN_TOKEN ?? (parsed.NODE_ENV === 'production' ? undefined : DEV_ADMIN_TOKEN),
    smtpUrl: parsed.SMTP_URL,
    mailFrom: parsed.MAIL_FROM,
    supportEmail: parsed.SUPPORT_EMAIL,
  };
}
