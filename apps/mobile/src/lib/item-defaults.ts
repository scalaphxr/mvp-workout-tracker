import { defaultItemParams, type ItemParams } from '@mvp/domain';
import type { Exercise, Goal } from '@mvp/schemas';

import { usePreferences } from './preferences';

/**
 * What a new item of a program starts with: the usual values for its goal and kind, with the
 * user's own rest between sets when one is set. Cardio has no rest between sets.
 */
export function itemDefaults(exercise: Exercise, goal: Goal | null): ItemParams {
  const usual = defaultItemParams(exercise, goal);
  const rest = usePreferences.getState().defaultRestSec;
  const counted = exercise.tracking === 'weight_reps' || exercise.tracking === 'reps';
  return rest !== null && counted ? { ...usual, rest_sec: rest } : usual;
}
