import { defineConfig } from 'drizzle-kit';

/** Migrations of the database on the phone. */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/sqlite/schema.ts',
  out: './drizzle-sqlite',
});
