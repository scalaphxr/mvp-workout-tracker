import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  /** Applies pending migrations from `packages/db/drizzle`. */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * `postgres://…` connects to a real PostgreSQL (production, docker compose).
 * `pglite://memory` and `pglite://<dir>` run PGlite, an in-process PostgreSQL,
 * used by the tests and by local development without Docker.
 */
export async function createDb(url: string): Promise<DbHandle> {
  if (url.startsWith('pglite://')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');

    const dataDir = url.slice('pglite://'.length);
    // PGlite creates its own directory, but not the ones above it.
    if (dataDir !== 'memory') await mkdir(dirname(resolve(dataDir)), { recursive: true });
    const client = new PGlite(dataDir === 'memory' ? undefined : dataDir);
    const db = drizzle(client, { schema });
    return {
      db,
      migrate: () => migrate(db, { migrationsFolder }),
      close: () => client.close(),
    };
  }

  const { default: pg } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');

  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  return {
    db,
    migrate: () => migrate(db, { migrationsFolder }),
    close: () => pool.end(),
  };
}
