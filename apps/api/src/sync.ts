import {
  activityLogs,
  and,
  asc,
  bodyLogs,
  type Db,
  eq,
  equipment,
  exercises,
  gt,
  gymEquipment,
  gymProfiles,
  intervalPresets,
  type PgColumn,
  type PgTable,
  programDays,
  programItems,
  programs,
  programState,
  progressionState,
  sessionExercises,
  sessions,
  setLogs,
  sql,
} from '@mvp/db';
import {
  SYNC_ROW_SCHEMAS,
  SYNC_TABLES,
  type SyncChange,
  type SyncPullResponse,
  type SyncPushResponse,
  type SyncRows,
  type SyncTable,
} from '@mvp/schemas';

import { canAccess } from './access';

type RejectCode = SyncPushResponse['rejected'][number]['code'];

/** What every synced table has on the server. */
type SyncedTable = PgTable & {
  id: PgColumn;
  ownerId: PgColumn;
  syncSeq: PgColumn;
  createdAt: PgColumn;
  updatedAt: PgColumn;
  deletedAt: PgColumn;
};
type Reference = [table: PgTable & { id: PgColumn }, id: string | null];
type Stamps = 'id' | 'created_at' | 'updated_at' | 'deleted_at';
type DbRow = Record<string, unknown>;

/** How one table takes part in sync: its columns and what its rows hang on. */
interface Handler<T extends SyncTable> {
  table: SyncedTable;
  /** The row this one belongs to. Top-level rows belong to whoever pushes them; so do rows with no parent id. */
  parent?: { table: SyncTable; id: (row: SyncRows[T]) => string | null };
  /** Rows of the catalog and other tables that must exist for this one. */
  references?: (row: SyncRows[T]) => Reference[];
  toDb(row: SyncRows[T]): DbRow;
  fromDb(row: DbRow): Omit<SyncRows[T], Stamps>;
}

const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : null);
const date = (value: string | null) => (value === null ? null : new Date(value));
// Columns are read back as `unknown`; each table states the type it stores.
const as = <V>(value: unknown) => value as V;

const HANDLERS: { [T in SyncTable]: Handler<T> } = {
  gym_profiles: {
    table: gymProfiles,
    toDb: (row) => ({
      name: row.name,
      locationType: row.location_type,
      isDefault: row.is_default,
    }),
    fromDb: (row) => ({
      name: as(row.name),
      location_type: as(row.locationType),
      is_default: as(row.isDefault),
    }),
  },
  gym_equipment: {
    table: gymEquipment,
    parent: { table: 'gym_profiles', id: (row) => row.gym_profile_id },
    references: (row) => [[equipment, row.equipment_id]],
    toDb: (row) => ({
      gymProfileId: row.gym_profile_id,
      equipmentId: row.equipment_id,
      incrementKg: row.increment_kg,
    }),
    fromDb: (row) => ({
      gym_profile_id: as(row.gymProfileId),
      equipment_id: as(row.equipmentId),
      increment_kg: as(row.incrementKg),
    }),
  },
  programs: {
    table: programs,
    toDb: (row) => ({
      title: row.title,
      description: row.description,
      goal: row.goal,
      level: row.level,
      daysPerWeek: row.days_per_week,
      visibility: row.visibility,
      forkedFromId: row.forked_from_id,
    }),
    fromDb: (row) => ({
      title: as(row.title),
      description: as(row.description),
      goal: as(row.goal),
      level: as(row.level),
      days_per_week: as(row.daysPerWeek),
      visibility: as(row.visibility),
      forked_from_id: as(row.forkedFromId),
    }),
  },
  program_days: {
    table: programDays,
    parent: { table: 'programs', id: (row) => row.program_id },
    toDb: (row) => ({
      programId: row.program_id,
      position: row.position,
      title: row.title,
      kind: row.kind,
    }),
    fromDb: (row) => ({
      program_id: as(row.programId),
      position: as(row.position),
      title: as(row.title),
      kind: as(row.kind),
    }),
  },
  program_items: {
    table: programItems,
    parent: { table: 'program_days', id: (row) => row.program_day_id },
    references: (row) => [[exercises, row.exercise_id]],
    toDb: (row) => ({
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
    fromDb: (row) => ({
      program_day_id: as(row.programDayId),
      position: as(row.position),
      exercise_id: as(row.exerciseId),
      sets: as(row.sets),
      rep_min: as(row.repMin),
      rep_max: as(row.repMax),
      rest_sec: as(row.restSec),
      target_rir: as(row.targetRir),
      superset_group: as(row.supersetGroup),
      increment_kg: as(row.incrementKg),
      notes: as(row.notes),
    }),
  },
  program_state: {
    table: programState,
    parent: { table: 'programs', id: (row) => row.program_id },
    toDb: (row) => ({
      programId: row.program_id,
      nextDayPosition: row.next_day_position,
      cycleNumber: row.cycle_number,
      deloadCycle: row.deload_cycle,
    }),
    fromDb: (row) => ({
      program_id: as(row.programId),
      next_day_position: as(row.nextDayPosition),
      cycle_number: as(row.cycleNumber),
      deload_cycle: as(row.deloadCycle),
    }),
  },
  progression_state: {
    table: progressionState,
    parent: { table: 'program_items', id: (row) => row.program_item_id },
    toDb: (row) => ({
      programItemId: row.program_item_id,
      nextWeightKg: row.next_weight_kg,
      nextTargetReps: row.next_target_reps,
      failStreak: row.fail_streak,
      reasonCode: row.reason_code,
      reasonParams: row.reason_params,
    }),
    fromDb: (row) => ({
      program_item_id: as(row.programItemId),
      next_weight_kg: as(row.nextWeightKg),
      next_target_reps: as(row.nextTargetReps),
      fail_streak: as(row.failStreak),
      reason_code: as(row.reasonCode),
      reason_params: as(row.reasonParams),
    }),
  },
  sessions: {
    table: sessions,
    parent: { table: 'programs', id: (row) => row.program_id },
    references: (row) => [[programDays, row.program_day_id]],
    toDb: (row) => ({
      programId: row.program_id,
      programDayId: row.program_day_id,
      cycleNumber: row.cycle_number,
      status: row.status,
      startedAt: date(row.started_at),
      finishedAt: date(row.finished_at),
      wellbeing: row.wellbeing,
      notes: row.notes,
    }),
    fromDb: (row) => ({
      program_id: as(row.programId),
      program_day_id: as(row.programDayId),
      cycle_number: as(row.cycleNumber),
      status: as(row.status),
      started_at: as(iso(row.startedAt)),
      finished_at: iso(row.finishedAt),
      wellbeing: as(row.wellbeing),
      notes: as(row.notes),
    }),
  },
  session_exercises: {
    table: sessionExercises,
    parent: { table: 'sessions', id: (row) => row.session_id },
    references: (row) => [
      [exercises, row.exercise_id],
      [exercises, row.substituted_from_id],
    ],
    toDb: (row) => ({
      sessionId: row.session_id,
      position: row.position,
      programItemId: row.program_item_id,
      exerciseId: row.exercise_id,
      substitutedFromId: row.substituted_from_id,
      plannedSets: row.planned_sets,
    }),
    fromDb: (row) => ({
      session_id: as(row.sessionId),
      position: as(row.position),
      program_item_id: as(row.programItemId),
      exercise_id: as(row.exerciseId),
      substituted_from_id: as(row.substitutedFromId),
      planned_sets: as(row.plannedSets),
    }),
  },
  set_logs: {
    table: setLogs,
    parent: { table: 'session_exercises', id: (row) => row.session_exercise_id },
    toDb: (row) => ({
      sessionExerciseId: row.session_exercise_id,
      setNumber: row.set_number,
      isWarmup: row.is_warmup,
      plannedWeightKg: row.planned_weight_kg,
      plannedRepMin: row.planned_rep_min,
      plannedRepMax: row.planned_rep_max,
      weightKg: row.weight_kg,
      reps: row.reps,
      rir: row.rir,
      durationSec: row.duration_sec,
      distanceM: row.distance_m,
      speedKmh: row.speed_kmh,
      inclinePct: row.incline_pct,
      resistanceLevel: row.resistance_level,
      avgHr: row.avg_hr,
      calories: row.calories,
      completedAt: date(row.completed_at),
    }),
    fromDb: (row) => ({
      session_exercise_id: as(row.sessionExerciseId),
      set_number: as(row.setNumber),
      is_warmup: as(row.isWarmup),
      planned_weight_kg: as(row.plannedWeightKg),
      planned_rep_min: as(row.plannedRepMin),
      planned_rep_max: as(row.plannedRepMax),
      weight_kg: as(row.weightKg),
      reps: as(row.reps),
      rir: as(row.rir),
      duration_sec: as(row.durationSec),
      distance_m: as(row.distanceM),
      speed_kmh: as(row.speedKmh),
      incline_pct: as(row.inclinePct),
      resistance_level: as(row.resistanceLevel),
      avg_hr: as(row.avgHr),
      calories: as(row.calories),
      completed_at: as(iso(row.completedAt)),
    }),
  },
  body_logs: {
    table: bodyLogs,
    toDb: (row) => ({
      date: row.date,
      weightKg: row.weight_kg,
      measuredAt: date(row.measured_at),
    }),
    fromDb: (row) => ({
      date: as(row.date),
      weight_kg: as(row.weightKg),
      measured_at: as(iso(row.measuredAt)),
    }),
  },
  interval_presets: {
    table: intervalPresets,
    toDb: (row) => ({
      title: row.title,
      workSec: row.work_sec,
      restSec: row.rest_sec,
      rounds: row.rounds,
      cycles: row.cycles,
      cycleRestSec: row.cycle_rest_sec,
    }),
    fromDb: (row) => ({
      title: as(row.title),
      work_sec: as(row.workSec),
      rest_sec: as(row.restSec),
      rounds: as(row.rounds),
      cycles: as(row.cycles),
      cycle_rest_sec: as(row.cycleRestSec),
    }),
  },
  activity_logs: {
    table: activityLogs,
    toDb: (row) => ({
      activityType: row.activity_type,
      startedAt: date(row.started_at),
      durationSec: row.duration_sec,
      intensity: row.intensity,
      distanceM: row.distance_m,
      avgHr: row.avg_hr,
      calories: row.calories,
      notes: row.notes,
    }),
    fromDb: (row) => ({
      activity_type: as(row.activityType),
      started_at: as(iso(row.startedAt)),
      duration_sec: as(row.durationSec),
      intensity: as(row.intensity),
      distance_m: as(row.distanceM),
      avg_hr: as(row.avgHr),
      calories: as(row.calories),
      notes: as(row.notes),
    }),
  },
};

const isSyncTable = (table: string): table is SyncTable =>
  (SYNC_TABLES as readonly string[]).includes(table);

/** A server row in the shape it travels in. */
export function toWire<T extends SyncTable>(table: T, row: DbRow): SyncRows[T] {
  return {
    id: row.id,
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
    deleted_at: iso(row.deletedAt),
    ...HANDLERS[table].fromDb(row),
  } as SyncRows[T];
}

/** The columns of a row for an insert on the server. */
export function toColumns<T extends SyncTable>(table: T, row: SyncRows[T], ownerId: string): DbRow {
  return {
    id: row.id,
    ownerId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: date(row.deleted_at),
    ...HANDLERS[table].toDb(row),
  };
}

/** The owner and the age of a row already on the server. */
async function find(db: Db, table: SyncedTable, id: string) {
  const [row] = await db
    .select({ ownerId: table.ownerId, updatedAt: table.updatedAt })
    .from(table)
    .where(eq(table.id, id));
  return row as { ownerId: string; updatedAt: Date } | undefined;
}

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

  const existing = await find(db, handler.table, row.id);
  // A row may be moved to another parent, so the parent is checked even for a known row.
  const parentId = handler.parent ? handler.parent.id(row) : null;
  const parent =
    handler.parent && parentId !== null
      ? await find(db, HANDLERS[handler.parent.table].table, parentId)
      : { ownerId: userId };
  if (!parent) return 'missing_parent';
  for (const ownerId of new Set([parent.ownerId, existing?.ownerId ?? parent.ownerId])) {
    if (!(await canAccess(db, userId, ownerId))) return 'forbidden';
  }
  for (const [referenced, id] of handler.references?.(row) ?? []) {
    if (id === null) continue;
    const found = await db.select({ id: referenced.id }).from(referenced).where(eq(referenced.id, id));
    if (found.length === 0) return 'missing_parent';
  }

  // The later `updated_at` wins. An older or the same copy is accepted and changes nothing:
  // a phone sends back rows it has just pulled, and those must not count as new changes.
  if (existing && existing.updatedAt >= new Date(row.updated_at)) return null;

  const { id: _id, ...columns } = toColumns(table, row, parent.ownerId);
  await db
    .insert(handler.table)
    .values({ id: row.id, ...columns })
    .onConflictDoUpdate({
      target: handler.table.id,
      set: { ...columns, syncSeq: sql`nextval('sync_seq')` },
    });
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
  const existing = await find(db, handler.table, id);
  // Deleting what is not there is not an error: the push may be a repeat.
  if (!existing) return null;
  if (!(await canAccess(db, userId, existing.ownerId))) return 'forbidden';

  const at = new Date(updatedAt);
  if (existing.updatedAt >= at) return null;
  await db
    .update(handler.table)
    .set({ deletedAt: at, updatedAt: at, syncSeq: sql`nextval('sync_seq')` })
    .where(eq(handler.table.id, id));
  return null;
}

/**
 * Applies a batch of changes from a phone. Changes are applied one by one, in order, so a
 * parent may come in the same batch before its children, and one bad row does not stop the
 * rest. Repeating a push changes nothing.
 */
export async function pushChanges(
  deps: { db: Db },
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

  return { accepted, rejected, cursor: await currentCursor(deps.db) };
}

async function currentCursor(db: Db): Promise<string> {
  const result = await db.execute(sql`select last_value::text as value from sync_seq`);
  const [row] = (result as { rows: { value: string }[] }).rows;
  return row?.value ?? '0';
}

export const PULL_PAGE = 500;

/**
 * The user's rows that changed on the server after the cursor, oldest change first: what
 * other devices pushed and what the server itself created (a program taken by code).
 */
export async function pullChanges(
  deps: { db: Db },
  userId: string,
  cursor: number,
  limit = PULL_PAGE,
): Promise<SyncPullResponse> {
  const found: { seq: number; table: SyncTable; row: DbRow }[] = [];
  for (const table of SYNC_TABLES) {
    const { table: source } = HANDLERS[table];
    const rows = await deps.db
      .select()
      .from(source)
      .where(and(eq(source.ownerId, userId), gt(source.syncSeq, cursor)))
      .orderBy(asc(source.syncSeq))
      .limit(limit + 1);
    for (const row of rows as DbRow[]) found.push({ seq: Number(row.syncSeq), table, row });
  }

  // Parents come before children when written in one request, but not across requests:
  // the phone applies a page as a whole, so the order inside it does not matter to it.
  found.sort((a, b) => a.seq - b.seq);
  const page = found.slice(0, limit);
  return {
    changes: page.map(({ table, row }) => ({ table, row: toWire(table, row) })),
    cursor: String(page.at(-1)?.seq ?? cursor),
    has_more: found.length > limit,
  };
}
