import { activity_logs, and, desc, eq, gt, isNull } from '@mvp/db/sqlite';
import { type ActivityLogRow, ActivityLogRowSchema } from '@mvp/schemas';

import { type DataContext, fresh } from './context';

export type ActivityInput = Omit<ActivityLogRow, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;

const alive = isNull(activity_logs.deleted_at);

/** Free activities, newest first. */
export function listActivities(ctx: DataContext, limit = 50): ActivityLogRow[] {
  return ctx.db
    .select()
    .from(activity_logs)
    .where(alive)
    .orderBy(desc(activity_logs.started_at))
    .limit(limit)
    .all();
}

/** The activities started after a moment (an ISO time), oldest first. */
export function activitiesSince(ctx: DataContext, since: string): ActivityLogRow[] {
  return ctx.db
    .select()
    .from(activity_logs)
    .where(and(alive, gt(activity_logs.started_at, since)))
    .orderBy(activity_logs.started_at)
    .all();
}

export function getActivity(ctx: DataContext, id: string): ActivityLogRow | null {
  return (
    ctx.db
      .select()
      .from(activity_logs)
      .where(and(alive, eq(activity_logs.id, id)))
      .get() ?? null
  );
}

/** Records an activity, or changes the one with `id`. Throws on values out of the limits. */
export function saveActivity(ctx: DataContext, input: ActivityInput, id?: string): ActivityLogRow {
  const existing = id ? getActivity(ctx, id) : null;
  const row = ActivityLogRowSchema.parse(
    existing ? { ...existing, ...input, updated_at: ctx.now() } : { ...fresh(ctx), ...input },
  );
  ctx.db
    .insert(activity_logs)
    .values(row)
    .onConflictDoUpdate({ target: activity_logs.id, set: row })
    .run();
  return row;
}

export function deleteActivity(ctx: DataContext, id: string): void {
  const now = ctx.now();
  ctx.db
    .update(activity_logs)
    .set({ deleted_at: now, updated_at: now })
    .where(eq(activity_logs.id, id))
    .run();
}
