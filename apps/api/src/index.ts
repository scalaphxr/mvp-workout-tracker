import { serve } from '@hono/node-server';
import { createDb } from '@mvp/db';

import { createApp } from './app';
import { loadConfig } from './config';
import { consoleMailer, smtpMailer } from './mailer';

try {
  process.loadEnvFile();
} catch {
  // No .env file: defaults and real environment variables are used.
}

const config = loadConfig();
const database = await createDb(config.databaseUrl);
await database.migrate();

const app = createApp({
  db: database.db,
  mailer: config.smtpUrl ? smtpMailer(config.smtpUrl, config.mailFrom) : consoleMailer(),
  jwtSecret: config.jwtSecret,
  adminToken: config.adminToken,
  now: () => new Date(),
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

const shutdown = () => {
  server.close(() => {
    void database.close().then(() => process.exit(0));
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
