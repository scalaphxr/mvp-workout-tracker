import {
  type Db,
  equipment,
  exercises,
  gymEquipment,
  gymProfiles,
  programDays,
  programItems,
  programs,
} from '@mvp/db';
import {
  SYNC_ROW_SCHEMAS,
  SYNC_TABLES,
  type SyncChange,
  type SyncPushResponse,
  type SyncRows,
  type SyncTable,
} from '@mvp/schemas';
import { eq, sql } from '@mvp/db';
import type { PgColumn, PgTable } from '@mvp/db';

import { canAccess } from './access';

type RejectCode = SyncPushResponse['rejected'][number]['code'];

/** How one table takes part in sync. */
interface Handler<T extends SyncTable> {
  table: PgTable & { id: PgColumn; updatedAt: PgColumn; deletedAt: PgColumn };
  /** The owner and the age of the row already on the server. */
  find(db: Db, id: string): Promise<{ ownerId: string; updatedAt: Date } | undefined>;
  /**
   * The owner of the row this one belongs to, `null` if that row is not on the server.
   * Absent for top-level tables: their rows belong to whoever pushes them.
   */
  parentOwner?(db: Db, row: SyncRows[T]): Promise<string | null>;
  /** Whether the reference rows (an exercise, a piece of equipment) exist. */
  referencesExist?(db: Db, row: SyncRows[T]): Promise<boolean>;
  toDb(row: SyncRows[T], ownerId: string): Record<string, unknown>;
}

const timestamps = (row: { created_at: string; updated_at: string; deleted_at: string | null }) => ({
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
  deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
});

const exists = async (db: Db, table: PgTable & { id: PgColumn }, id: string) =>
  (await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1)).length > 0;

const ownerOfProfile = async (db: Db, id: string) =>
  (
    await db
      .select({ ownerId: gymProfiles.userId, updatedAt: gymProfiles.updatedAt })
      .from(gymProfiles)
      .where(eq(gymProfiles.id, id))
  )[0];

const ownerOfProgram = async (db: Db, id: string) =>
  (
    await db
      .select({ ownerId: programs.ownerId, updatedAt: programs.updatedAt })
      .from(programs)
      .where(eq(programs.id, id))
  )[0];

const ownerOfDay = async (db: Db, id: string) =>
  (
    await db
      .select({ ownerId: programs.ownerId, updatedAt: programDays.updatedAt })
      .from(programDays)
      .innerJoin(programs, eq(programs.id, programDays.programId))
      .where(eq(programDays.id, id))
  )[0];

const HANDLERS: { [T in SyncTable]: Handler<T> } = {
  gym_profiles: {
    table: gymProfiles,
    find: ownerOfProfile,
    toDb: (row, ownerId) => ({
      id: row.id,
      ...timestamps(row),
      userId: ownerId,
      name: row.name,
      locationType: row.location_type,
      isDefault: row.is_default,
    }),
  },
  gym_equipment: {
    table: gymEquipment,
    find: async (db, id) =>
      (
        await db
          .select({ ownerId: gymProfiles.userId, updatedAt: gymEquipment.updatedAt })
          .from(gymEquipment)
          .innerJoin(gymProfiles, eq(gymProfiles.id, gymEquipment.gymProfileId))
          .where(eq(gymEquipment.id, id))
      )[0],
    parentOwner: async (db, row) => (await ownerOfProfile(db, row.gym_profile_id))?.ownerId ?? null,
    referencesExist: (db, row) => exists(db, equipment, row.equipment_id),
    toDb: (row) => ({
      id: row.id,
      ...timestamps(row),
      gymProfileId: row.gym_profile_id,
      equipmentId: row.equipment_id,
      incrementKg: row.increment_kg,
    }),
  },
  programs: {
    table: programs,
    find: ownerOfProgram,
    toDb: (row, ownerId) => ({
      id: row.id,
      ...timestamps(row),
      ownerId,
      title: row.title,
      description: row.description,
      goal: row.goal,
      level: row.level,
      daysPerWeek: row.days_per_week,
      visibility: row.visibility,
      forkedFromId: row.forked_from_id,
    }),
  },
  program_days: {
    table: programDays,
    find: ownerOfDay,
    parentOwner: async (db, row) => (await ownerOfProgram(db, row.program_id))?.ownerId ?? null,
    toDb: (row) => ({
      id: row.id,
      ...timestamps(row),
      programId: row.program_id,
      position: row.position,
      title: row.title,
      kind: row.kind,
    }),
  },
  program_items: {
    table: programItems,
    find: async (db, id) =>
      (
        await db
          .select({ ownerId: programs.ownerId, updatedAt: programItems.updatedAt })
          .from(programItems)
          .innerJoin(programDays, eq(programDays.id, programItems.programDayId))
          .innerJoin(programs, eq(programs.id, programDays.programId))
          .where(eq(programItems.id, id))
      )[0],
    parentOwner: async (db, row) => (await ownerOfDay(db, row.program_day_id))?.ownerId ?? null,
    referencesExist: (db, row) => exists(db, exercises, row.exercise_id),
    toDb: (row) => ({
      id: row.id,
      ...timestamps(row),
      programDayId: row.program_day_id,
      position: row.position,
      exerciseId: row.exercise_id,
      sets: row.sets,
      repMin: row.rep_min,
      repMax: row.rep_max,
      restSec: row.rest_sec,
      targetRir: row.target_rir,
      supersetGroup: row.superset_group,
      incrementKg: row.increment_kg,
      notes: row.notes,
    }),
  },
};

const isSyncTable = (table: string): table is SyncTable =>
  (SYNC_TABLES as readonly string[]).includes(table);

async function upsert<T extends SyncTable>(
  db: Db,
  userId: string,
  table: T,
  input: unknown,
): Promise<RejectCode | null> {
  const handler: Handler<T> = HANDLERS[table];
  const parsed = SYNC_ROW_SCHEMAS[table].safeParse(input);
  if (!parsed.success) return 'validation_error';
  const row = parsed.data as SyncRows[T];

  const existing = await handler.find(db, row.id);
  // The row may be moved to another parent, so the parent is checked even for a known row.
  const parentOwner = handler.parentOwner ? await handler.parentOwner(db, row) : userId;
  if (parentOwner === null) return 'missing_parent';
  for (const ownerId of new Set([parentOwner, existing?.ownerId ?? parentOwner])) {
    if (!(await canAccess(db, userId, ownerId))) return 'forbidden';
  }
  if (handler.referencesExist && !(await handler.referencesExist(db, row))) return 'missing_parent';

  // The later `updated_at` wins: an older copy of the row is accepted but changes nothing.
  if (existing && existing.updatedAt > new Date(row.updated_at)) return null;

  const values = handler.toDb(row, parentOwner);
  const { id: _id, ...changes } = values;
  await db
    .insert(handler.table)
    .values(values)
    .onConflictDoUpdate({ target: handler.table.id, set: changes });
  return null;
}

async function softDelete(
  db: Db,
  userId: string,
  table: SyncTable,
  id: string,
  updatedAt: string,
): Promise<RejectCode | null> {
  const handler = HANDLERS[table];
  const existing = await handler.find(db, id);
  // Deleting what is not there is not an error: the push may be a repeat.
  if (!existing) return null;
  if (!(await canAccess(db, userId, existing.ownerId))) return 'forbidden';

  const at = new Date(updatedAt);
  if (existing.updatedAt > at) return null;
  await db
    .update(handler.table)
    .set({ deletedAt: at, updatedAt: at })
    .where(sql`${handler.table.id} = ${id}`);
  return null;
}

/**
 * Applies a batch of changes from a phone. Changes are applied one by one, in order, so a
 * parent may come in the same batch before its children, and one bad row does not stop the
 * rest. Repeating a push changes nothing.
 */
export async function pushChanges(
  deps: { db: Db; now: () => Date },
  userId: string,
  changes: readonly SyncChange[],
): Promise<SyncPushResponse> {
  const accepted: string[] = [];
  const rejected: SyncPushResponse['rejected'] = [];

  for (const change of changes) {
    const id = change.op === 'upsert' ? change.row.id : change.id;
    const code = !isSyncTable(change.table)
      ? 'unknown_table'
      : change.op === 'upsert'
        ? await upsert(deps.db, userId, change.table, change.row)
        : await softDelete(deps.db, userId, change.table, change.id, change.updated_at);

    if (code) rejected.push({ id, code });
    else accepted.push(id);
  }

  return { accepted, rejected, cursor: deps.now().toISOString() };
}
