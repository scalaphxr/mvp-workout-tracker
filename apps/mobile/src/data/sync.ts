import { and, eq, inArray, outbox, sync_state, syncedTables } from '@mvp/db/sqlite';
import {
  SYNC_ROW_SCHEMAS,
  SYNC_TABLES,
  type SyncChange,
  type SyncPullResponse,
  type SyncPushResponse,
  type SyncTable,
} from '@mvp/schemas';

import type { DataContext } from './context';

// Every synced table has these columns; the rest differ and are handled as plain rows here.
type AnyTable = (typeof syncedTables)['programs'];
type AnyRow = { id: string; updated_at: string } & Record<string, unknown>;
const tableOf = (name: SyncTable) => syncedTables[name] as unknown as AnyTable;

export function getSyncState(ctx: DataContext, key: string): string | null {
  return ctx.db.select().from(sync_state).where(eq(sync_state.key, key)).get()?.value ?? null;
}

export function setSyncState(ctx: DataContext, key: string, value: string | null): void {
  if (value === null) ctx.db.delete(sync_state).where(eq(sync_state.key, key)).run();
  else {
    ctx.db
      .insert(sync_state)
      .values({ key, value })
      .onConflictDoUpdate({ target: sync_state.key, set: { value } })
      .run();
  }
}

/** A row that was sent, with the version of it that went out. */
export interface Sent {
  table: SyncTable;
  id: string;
  updated_at: string;
}

export const PUSH_BATCH = 300;

/**
 * The next rows waiting to go to the server, parents before children. Triggers queue a row
 * on every write, so the queue is the phone's whole unsent history, online or not.
 */
export function pendingChanges(
  ctx: DataContext,
  limit = PUSH_BATCH,
): { changes: SyncChange[]; sent: Sent[] } {
  const changes: SyncChange[] = [];
  const sent: Sent[] = [];

  for (const table of SYNC_TABLES) {
    if (changes.length >= limit) break;
    const ids = ctx.db
      .select({ id: outbox.row_id })
      .from(outbox)
      .where(eq(outbox.table_name, table))
      .limit(limit - changes.length)
      .all()
      .map((entry) => entry.id);
    if (ids.length === 0) continue;

    const source = tableOf(table);
    const rows = ctx.db.select().from(source).where(inArray(source.id, ids)).all() as AnyRow[];
    for (const row of rows) {
      // A deleted row travels as itself: `deleted_at` is set in it.
      changes.push({ table, op: 'upsert', row });
      sent.push({ table, id: row.id, updated_at: row.updated_at });
    }
  }
  return { changes, sent };
}

/**
 * Takes what the server has dealt with out of the queue. A row changed while the request was
 * on its way stays queued, and so does one whose parent the server does not have yet.
 */
export function markPushed(ctx: DataContext, sent: readonly Sent[], response: SyncPushResponse) {
  const waiting = new Set(
    response.rejected.filter((entry) => entry.code === 'missing_parent').map((entry) => entry.id),
  );
  ctx.db.transaction((tx) => {
    for (const { table, id, updated_at } of sent) {
      if (waiting.has(id)) continue;
      const source = tableOf(table);
      const current = tx
        .select({ updated_at: source.updated_at })
        .from(source)
        .where(eq(source.id, id))
        .get();
      if (current && current.updated_at !== updated_at) continue;
      tx.delete(outbox)
        .where(and(eq(outbox.table_name, table), eq(outbox.row_id, id)))
        .run();
    }
  });
}

const APPLYING = 'applying';

/**
 * Writes rows that came from the server. The later `updated_at` wins, so a row changed on
 * this phone and not sent yet is kept. Rows written here are not queued for sending back.
 */
export function applyPulled(ctx: DataContext, changes: SyncPullResponse['changes']): number {
  let applied = 0;
  ctx.db.transaction((tx) => {
    const inTx = { ...ctx, db: tx };
    setSyncState(inTx, APPLYING, '1');
    for (const change of changes) {
      const parsed = SYNC_ROW_SCHEMAS[change.table].safeParse(change.row);
      if (!parsed.success) continue;
      const row = parsed.data as AnyRow;

      const source = tableOf(change.table);
      const local = tx
        .select({ updated_at: source.updated_at })
        .from(source)
        .where(eq(source.id, row.id))
        .get();
      if (local && local.updated_at >= row.updated_at) continue;

      tx.insert(source)
        .values(row as never)
        .onConflictDoUpdate({ target: source.id, set: row as never })
        .run();
      applied++;
    }
    setSyncState(inTx, APPLYING, null);
  });
  return applied;
}

/** How many rows are waiting to be sent. */
export function pendingCount(ctx: DataContext): number {
  return ctx.db.select({ id: outbox.row_id }).from(outbox).all().length;
}

// --- A whole sync ---

/** How the phone reaches the server; the app passes its API client, tests a server in memory. */
export interface SyncTransport {
  push(changes: SyncChange[]): Promise<SyncPushResponse>;
  pull(cursor: string | null): Promise<SyncPullResponse>;
}

const PULL_CURSOR = 'pull_cursor';

/**
 * Sends everything waiting in the queue, then takes what changed on the server. Safe to run
 * at any time and to repeat: a failed request leaves the queue and the cursor as they were.
 */
export async function runSync(
  ctx: DataContext,
  transport: SyncTransport,
): Promise<{ pushed: number; pulled: number }> {
  let pushed = 0;
  for (;;) {
    const { changes, sent } = pendingChanges(ctx);
    if (changes.length === 0) break;
    const waiting = pendingCount(ctx);
    const response = await transport.push(changes);
    markPushed(ctx, sent, response);
    pushed += response.accepted.length;
    // Rows the server cannot take yet stay queued; do not spin on them.
    if (pendingCount(ctx) >= waiting) break;
  }

  let pulled = 0;
  for (;;) {
    const page = await transport.pull(getSyncState(ctx, PULL_CURSOR));
    pulled += applyPulled(ctx, page.changes);
    setSyncState(ctx, PULL_CURSOR, page.cursor);
    if (!page.has_more) break;
  }
  return { pushed, pulled };
}
/**
 * Forgets all of the user's data on this phone, the queue and the sync state with it: after
 * the account is deleted the phone starts over as on the first launch, a guest with no data.
 */
export function wipeLocalData(ctx: DataContext): void {
  ctx.db.transaction((tx) => {
    // Children before parents: rows reference the rows they hang on.
    for (const table of [...SYNC_TABLES].reverse()) tx.delete(tableOf(table)).run();
    tx.delete(outbox).run();
    tx.delete(sync_state).run();
  });
}
