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

/** A calendar day (YYYY-MM-DD) of a moment, in the phone's time zone. */
export const localDate = (iso: string) => {
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};

/**
 * The body weight on a day: the last one entered on it or before, else the first one entered
 * after it; `null` – no weight was ever entered.
 */
export function weightOn(ctx: DataContext, date: string): number | null {
  return weightAmong(listWeights(ctx), date);
}

/** `weightOn` over weights already read, oldest first: for many days at once. */
export function weightAmong(
  weights: readonly { date: string; weight_kg: number }[],
  date: string,
): number | null {
  const before = weights.filter((entry) => entry.date <= date).at(-1);
  return (before ?? weights[0])?.weight_kg ?? null;
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
