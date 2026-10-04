import type { LocalDb } from '@mvp/db/sqlite';

/**
 * What the data layer needs from the outside. The app gives it the phone database, the clock
 * and random ids; tests give it an in-memory database and predictable values.
 */
export interface DataContext {
  db: LocalDb;
  /** The current time as an ISO string. */
  now(): string;
  /** A new UUID v7. */
  newId(): string;
}

/** The fields every synced row starts with. */
export const fresh = (ctx: DataContext) => {
  const now = ctx.now();
  return { id: ctx.newId(), created_at: now, updated_at: now, deleted_at: null };
};
