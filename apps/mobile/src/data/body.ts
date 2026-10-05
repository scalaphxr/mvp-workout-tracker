import { asc, body_logs, eq, isNull } from '@mvp/db/sqlite';
import type { WeightEntry } from '@mvp/domain';
import { BodyLogRowSchema } from '@mvp/schemas';

import { type DataContext, fresh } from './context';

/**
 * Morning weights, one per calendar day, oldest first. Two devices may each have logged the
 * same day before they synced: the entry written last is the one that counts.
 */
export function listWeights(ctx: DataContext): WeightEntry[] {
  const rows = ctx.db
    .select()
    .from(body_logs)
    .where(isNull(body_logs.deleted_at))
    .orderBy(asc(body_logs.date), asc(body_logs.updated_at))
    .all();
  const byDate = new Map(rows.map((row) => [row.date, row]));
  return [...byDate.values()].map((row) => ({ date: row.date, weight_kg: row.weight_kg }));
}

/** Saves the weight of a day; entering it again replaces what was there. */
export function setWeight(ctx: DataContext, date: string, weightKg: number): void {
  const now = ctx.now();
  const existing = ctx.db
    .select()
    .from(body_logs)
    .where(eq(body_logs.date, date))
    .all()
    .filter((row) => row.deleted_at === null)
    .at(-1);

  const row = BodyLogRowSchema.parse(
    existing
      ? { ...existing, weight_kg: weightKg, measured_at: now, updated_at: now }
      : { ...fresh(ctx), date, weight_kg: weightKg, measured_at: now },
  );
  ctx.db.insert(body_logs).values(row).onConflictDoUpdate({ target: body_logs.id, set: row }).run();
}

/** Removes the weight of a day (entered by mistake). */
export function deleteWeight(ctx: DataContext, date: string): void {
  ctx.db
    .update(body_logs)
    .set({ deleted_at: ctx.now(), updated_at: ctx.now() })
    .where(eq(body_logs.date, date))
    .run();
}
