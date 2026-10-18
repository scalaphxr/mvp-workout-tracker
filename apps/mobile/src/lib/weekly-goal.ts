import type { DataContext } from '@/data/context';
import { getProgramTree } from '@/data/programs';

import { useActiveProgram, useLocal } from './local';
import { usePreferences } from './preferences';

/**
 * The goal of a week: the user's own, or the days a week of the active program – as it says,
 * or as many regular days as it has (a program built by hand or from text says nothing).
 */
export function weeklyGoalOf(ctx: DataContext, goal: number | null, programId: string | null) {
  if (goal !== null) return goal;
  const tree = programId ? getProgramTree(ctx, programId) : null;
  if (!tree) return null;
  const days = tree.days.filter((day) => day.kind === 'regular').length;
  return tree.program.days_per_week ?? (days > 0 ? Math.min(days, 7) : null);
}

export function useWeeklyGoal(): number | null {
  const goal = usePreferences((state) => state.weeklyGoal);
  const programId = useActiveProgram((state) => state.id);
  return useLocal((ctx) => weeklyGoalOf(ctx, goal, programId));
}
