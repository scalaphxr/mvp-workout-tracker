import { and, asc, eq, interval_presets, isNull } from '@mvp/db/sqlite';
import type { IntervalPlan } from '@mvp/domain';
import { type IntervalPresetRow, IntervalPresetRowSchema } from '@mvp/schemas';

import { type DataContext, fresh } from './context';

export type IntervalPresetInput = IntervalPlan & { title: string };

/** The user's own presets of the interval timer, oldest first. */
export function listIntervalPresets(ctx: DataContext): IntervalPresetRow[] {
  return ctx.db
    .select()
    .from(interval_presets)
    .where(isNull(interval_presets.deleted_at))
    .orderBy(asc(interval_presets.created_at))
    .all();
}

export function getIntervalPreset(ctx: DataContext, id: string): IntervalPresetRow | null {
  return (
    ctx.db
      .select()
      .from(interval_presets)
      .where(and(eq(interval_presets.id, id), isNull(interval_presets.deleted_at)))
      .get() ?? null
  );
}

/** Creates a preset, or changes the one with `id`. Throws on values out of the limits. */
export function saveIntervalPreset(
  ctx: DataContext,
  input: IntervalPresetInput,
  id?: string,
): IntervalPresetRow {
  const existing = id ? getIntervalPreset(ctx, id) : null;
  const row = IntervalPresetRowSchema.parse(
    existing ? { ...existing, ...input, updated_at: ctx.now() } : { ...fresh(ctx), ...input },
  );
  ctx.db
    .insert(interval_presets)
    .values(row)
    .onConflictDoUpdate({ target: interval_presets.id, set: row })
    .run();
  return row;
}

export function deleteIntervalPreset(ctx: DataContext, id: string): void {
  const now = ctx.now();
  ctx.db
    .update(interval_presets)
    .set({ deleted_at: now, updated_at: now })
    .where(eq(interval_presets.id, id))
    .run();
}
