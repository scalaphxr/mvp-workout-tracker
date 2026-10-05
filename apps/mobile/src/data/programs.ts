import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  program_days,
  program_items,
  programs,
} from '@mvp/db/sqlite';
import { type ItemParams, linkWithNext, normalizeSupersets, unlink } from '@mvp/domain';
import {
  type ProgramDayKind,
  type ProgramDayRow,
  ProgramDayRowSchema,
  type ProgramItemRow,
  ProgramItemRowSchema,
  type ProgramRow,
  ProgramRowSchema,
  type ProgramTree,
  type SyncChange,
} from '@mvp/schemas';

import { type DataContext, fresh } from './context';

/** The user's programs, newest first. */
export function listPrograms(ctx: DataContext): ProgramRow[] {
  return ctx.db
    .select()
    .from(programs)
    .where(isNull(programs.deleted_at))
    .orderBy(desc(programs.created_at))
    .all();
}

const liveDays = (ctx: DataContext, programId: string) =>
  ctx.db
    .select()
    .from(program_days)
    .where(and(eq(program_days.program_id, programId), isNull(program_days.deleted_at)))
    .orderBy(asc(program_days.position))
    .all();

const liveItems = (ctx: DataContext, dayIds: string[]) =>
  dayIds.length === 0
    ? []
    : ctx.db
        .select()
        .from(program_items)
        .where(and(inArray(program_items.program_day_id, dayIds), isNull(program_items.deleted_at)))
        .orderBy(asc(program_items.position))
        .all();

/** A program with its days and items in order, without what was deleted. */
export function getProgramTree(ctx: DataContext, programId: string): ProgramTree | null {
  const program = ctx.db
    .select()
    .from(programs)
    .where(and(eq(programs.id, programId), isNull(programs.deleted_at)))
    .get();
  if (!program) return null;

  const days = liveDays(ctx, programId);
  return {
    program,
    days,
    items: liveItems(
      ctx,
      days.map((day) => day.id),
    ),
  };
}

/** A new program with its first, empty day. */
export function createProgram(
  ctx: DataContext,
  input: { title: string; firstDayTitle: string },
): ProgramRow {
  return ctx.db.transaction((tx) => {
    const inTx = { ...ctx, db: tx };
    const program = ProgramRowSchema.parse({
      ...fresh(ctx),
      title: input.title,
      description: '',
      goal: null,
      level: null,
      days_per_week: null,
      visibility: 'private',
      forked_from_id: null,
    });
    tx.insert(programs).values(program).run();
    addDay(inTx, program.id, input.firstDayTitle, 'regular');
    return program;
  });
}

export function updateProgram(
  ctx: DataContext,
  id: string,
  patch: Partial<Pick<ProgramRow, 'title' | 'description' | 'goal' | 'visibility'>>,
): void {
  const program = ctx.db.select().from(programs).where(eq(programs.id, id)).get();
  if (!program) return;
  const updated = ProgramRowSchema.parse({ ...program, ...patch, updated_at: ctx.now() });
  ctx.db.update(programs).set(updated).where(eq(programs.id, id)).run();
}

/** Deletes a program with its days and items. */
export function deleteProgram(ctx: DataContext, id: string): void {
  const gone = { deleted_at: ctx.now(), updated_at: ctx.now() };
  ctx.db.transaction((tx) => {
    const dayIds = liveDays({ ...ctx, db: tx }, id).map((day) => day.id);
    if (dayIds.length > 0) {
      tx.update(program_items)
        .set(gone)
        .where(and(inArray(program_items.program_day_id, dayIds), isNull(program_items.deleted_at)))
        .run();
      tx.update(program_days).set(gone).where(inArray(program_days.id, dayIds)).run();
    }
    tx.update(programs).set(gone).where(eq(programs.id, id)).run();
  });
}

// --- Days ---

/** Rewrites positions as 0, 1, 2… in the given order; only rows that move are touched. */
function renumberDays(ctx: DataContext, days: readonly ProgramDayRow[]) {
  days.forEach((day, position) => {
    if (day.position === position) return;
    ctx.db
      .update(program_days)
      .set({ position, updated_at: ctx.now() })
      .where(eq(program_days.id, day.id))
      .run();
  });
}

/**
 * Adds a day at the end. A program has at most one "every workout" block: asking for a second
 * one returns the existing block.
 */
export function addDay(
  ctx: DataContext,
  programId: string,
  title: string,
  kind: ProgramDayKind,
): ProgramDayRow {
  const days = liveDays(ctx, programId);
  const block = days.find((day) => day.kind === 'every_session');
  if (kind === 'every_session' && block) return block;

  const day = ProgramDayRowSchema.parse({
    ...fresh(ctx),
    program_id: programId,
    position: days.length,
    title,
    kind,
  });
  ctx.db.insert(program_days).values(day).run();
  return day;
}

export function renameDay(ctx: DataContext, dayId: string, title: string): void {
  const day = ctx.db.select().from(program_days).where(eq(program_days.id, dayId)).get();
  if (!day) return;
  const updated = ProgramDayRowSchema.parse({ ...day, title, updated_at: ctx.now() });
  ctx.db.update(program_days).set(updated).where(eq(program_days.id, dayId)).run();
}

export function deleteDay(ctx: DataContext, dayId: string): void {
  const day = ctx.db.select().from(program_days).where(eq(program_days.id, dayId)).get();
  if (!day) return;
  const gone = { deleted_at: ctx.now(), updated_at: ctx.now() };
  ctx.db.transaction((tx) => {
    tx.update(program_items)
      .set(gone)
      .where(and(eq(program_items.program_day_id, dayId), isNull(program_items.deleted_at)))
      .run();
    tx.update(program_days).set(gone).where(eq(program_days.id, dayId)).run();
    renumberDays({ ...ctx, db: tx }, liveDays({ ...ctx, db: tx }, day.program_id));
  });
}

/** Moves a day one place up (-1) or down (+1) among the days of its program. */
export function moveDay(ctx: DataContext, dayId: string, delta: -1 | 1): void {
  const day = ctx.db.select().from(program_days).where(eq(program_days.id, dayId)).get();
  if (!day) return;
  ctx.db.transaction((tx) => {
    const inTx = { ...ctx, db: tx };
    const days = liveDays(inTx, day.program_id);
    renumberDays(inTx, moved(days, dayId, delta));
  });
}

function moved<T extends { id: string }>(rows: readonly T[], id: string, delta: -1 | 1): T[] {
  const from = rows.findIndex((row) => row.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= rows.length) return [...rows];
  const result = [...rows];
  [result[from], result[to]] = [result[to] as T, result[from] as T];
  return result;
}

// --- Items ---

/** The items of a day, in order. */
export const dayItems = (ctx: DataContext, dayId: string) => liveItems(ctx, [dayId]);

/**
 * Writes the order and the supersets of a day's items: positions become 0, 1, 2… and
 * `groups` (one per item, in order) the superset numbers. Only rows that change are touched.
 */
function arrangeItems(
  ctx: DataContext,
  items: readonly ProgramItemRow[],
  groups: readonly (number | null)[],
) {
  items.forEach((item, position) => {
    const group = groups[position] ?? null;
    if (item.position === position && item.superset_group === group) return;
    ctx.db
      .update(program_items)
      .set({ position, superset_group: group, updated_at: ctx.now() })
      .where(eq(program_items.id, item.id))
      .run();
  });
}

const groupsOf = (items: readonly ProgramItemRow[]) => items.map((item) => item.superset_group);

/** Adds an exercise at the end of a day. */
export function addItem(
  ctx: DataContext,
  dayId: string,
  exerciseId: string,
  params: ItemParams,
): ProgramItemRow {
  const item = ProgramItemRowSchema.parse({
    ...fresh(ctx),
    program_day_id: dayId,
    position: dayItems(ctx, dayId).length,
    exercise_id: exerciseId,
    ...params,
    superset_group: null,
    increment_kg: null,
    notes: '',
  });
  ctx.db.insert(program_items).values(item).run();
  return item;
}

export function getItem(ctx: DataContext, itemId: string): ProgramItemRow | null {
  return (
    ctx.db
      .select()
      .from(program_items)
      .where(and(eq(program_items.id, itemId), isNull(program_items.deleted_at)))
      .get() ?? null
  );
}

export type ItemPatch = Partial<
  Pick<
    ProgramItemRow,
    'sets' | 'rep_min' | 'rep_max' | 'rest_sec' | 'target_rir' | 'increment_kg' | 'notes'
  >
>;

/** Changes the numbers of an item. A range that is not min ≤ max is refused. */
export function updateItem(ctx: DataContext, itemId: string, patch: ItemPatch): void {
  const item = getItem(ctx, itemId);
  if (!item) return;
  const updated = ProgramItemRowSchema.parse({ ...item, ...patch, updated_at: ctx.now() });
  ctx.db.update(program_items).set(updated).where(eq(program_items.id, itemId)).run();
}

/** Swaps the exercise of an item (a permanent replacement); the weight step starts over. */
export function replaceExercise(ctx: DataContext, itemId: string, exerciseId: string): void {
  ctx.db
    .update(program_items)
    .set({ exercise_id: exerciseId, increment_kg: null, updated_at: ctx.now() })
    .where(eq(program_items.id, itemId))
    .run();
}

export function deleteItem(ctx: DataContext, itemId: string): void {
  const item = getItem(ctx, itemId);
  if (!item) return;
  ctx.db.transaction((tx) => {
    const inTx = { ...ctx, db: tx };
    tx.update(program_items)
      .set({ deleted_at: ctx.now(), updated_at: ctx.now() })
      .where(eq(program_items.id, itemId))
      .run();
    const rest = dayItems(inTx, item.program_day_id);
    arrangeItems(inTx, rest, normalizeSupersets(groupsOf(rest)));
  });
}

/** Moves an item one place up (-1) or down (+1) within its day. */
export function moveItem(ctx: DataContext, itemId: string, delta: -1 | 1): void {
  const item = getItem(ctx, itemId);
  if (!item) return;
  ctx.db.transaction((tx) => {
    const inTx = { ...ctx, db: tx };
    const items = moved(dayItems(inTx, item.program_day_id), itemId, delta);
    // An item moved out of its superset leaves it; one moved between two of a superset splits it.
    arrangeItems(inTx, items, normalizeSupersets(groupsOf(items)));
  });
}

/** Joins an item with the next one into a superset, or takes it out of its superset. */
export function setSuperset(ctx: DataContext, itemId: string, action: 'link-next' | 'unlink'): void {
  const item = getItem(ctx, itemId);
  if (!item) return;
  ctx.db.transaction((tx) => {
    const inTx = { ...ctx, db: tx };
    const items = dayItems(inTx, item.program_day_id);
    const index = items.findIndex((candidate) => candidate.id === itemId);
    const groups = groupsOf(items);
    arrangeItems(inTx, items, action === 'unlink' ? unlink(groups, index) : linkWithNext(groups, index));
  });
}

// --- A whole program at once ---

/** A program that is not saved yet: made from the questionnaire or read from pasted text. */
export interface ProgramDraft {
  title: string;
  goal: ProgramRow['goal'];
  level: ProgramRow['level'];
  days_per_week: number | null;
  days: {
    title: string;
    items: (ItemParams & { exercise_id: string; superset?: boolean })[];
  }[];
}

/** Saves a draft as an ordinary program that the constructor can edit. */
export function createProgramFromDraft(ctx: DataContext, draft: ProgramDraft): ProgramRow {
  return ctx.db.transaction((tx) => {
    const inTx = { ...ctx, db: tx };
    const program = ProgramRowSchema.parse({
      ...fresh(ctx),
      title: draft.title,
      description: '',
      goal: draft.goal,
      level: draft.level,
      days_per_week: draft.days_per_week,
      visibility: 'private',
      forked_from_id: null,
    });
    tx.insert(programs).values(program).run();

    for (const day of draft.days) {
      const { id: dayId } = addDay(inTx, program.id, day.title, 'regular');
      // An item marked as a superset shares a group with the item above it.
      const joined: (number | null)[] = [];
      day.items.forEach((item, position) => {
        const above = joined[position - 1];
        if (!item.superset || position === 0) joined.push(null);
        else {
          if (above == null) joined[position - 1] = position;
          joined.push(joined[position - 1] ?? null);
        }
      });
      const groups = normalizeSupersets(joined);

      day.items.forEach(({ exercise_id, superset: _superset, ...params }, position) => {
        const row = ProgramItemRowSchema.parse({
          ...fresh(ctx),
          program_day_id: dayId,
          position,
          exercise_id,
          ...params,
          superset_group: groups[position] ?? null,
          increment_kg: null,
          notes: '',
        });
        tx.insert(program_items).values(row).run();
      });
    }    return program;
  });
}

// --- Exchange with the server ---

/** Saves a program received from the server (taken by code) as it is. */
export function importTree(ctx: DataContext, tree: ProgramTree): void {
  ctx.db.transaction((tx) => {
    tx.insert(programs).values(tree.program).run();
    if (tree.days.length > 0) tx.insert(program_days).values(tree.days).run();
    if (tree.items.length > 0) tx.insert(program_items).values(tree.items).run();
  });
}

/** Everything of a program for a sync push, deleted rows included, parents first. */
export function programChanges(ctx: DataContext, programId: string): SyncChange[] {
  const program = ctx.db.select().from(programs).where(eq(programs.id, programId)).get();
  if (!program) return [];
  const days = ctx.db.select().from(program_days).where(eq(program_days.program_id, programId)).all();
  const items =
    days.length === 0
      ? []
      : ctx.db
          .select()
          .from(program_items)
          .where(
            inArray(
              program_items.program_day_id,
              days.map((day) => day.id),
            ),
          )
          .all();

  return [
    { table: 'programs', op: 'upsert', row: program },
    ...days.map((row): SyncChange => ({ table: 'program_days', op: 'upsert', row })),
    ...items.map((row): SyncChange => ({ table: 'program_items', op: 'upsert', row })),
  ];
}
