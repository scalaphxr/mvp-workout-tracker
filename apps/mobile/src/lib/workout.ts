import { weightStepKg } from '@mvp/domain';
import type { ProgressionStateRow } from '@mvp/schemas';
import type { TFunction } from 'i18next';

import type { ExerciseFacts } from '@/data/sessions';

import { useCatalog } from './catalog';
import { useGym } from './gym';
import { formatWeight, type Units, useUnits } from './units';

/** What progression needs to know about an exercise: taken from the catalog and the main gym. */
export function useExerciseFacts(): ExerciseFacts {
  const { catalog, exerciseById } = useCatalog();
  const gym = useGym();
  const units = useUnits();

  return (exerciseId) => {
    const exercise = exerciseById.get(exerciseId);
    if (!exercise) return null;
    return {
      step_kg: weightStepKg(exercise, catalog.equipment, gym?.steps, units),
      // Cardio, stretching and timed holds are only logged: no automatic progression.
      progresses: exercise.tracking === 'weight_reps' || exercise.tracking === 'reps',
    };
  };
}

/**
 * Why the plan is what it is, in the user's language. The plan stores a code and numbers;
 * the sentence is put together here, whole, with the right plural forms.
 */
export function explainPlan(
  t: TFunction,
  locale: string,
  plan: Pick<ProgressionStateRow, 'reason_code' | 'reason_params'>,
  units: Units,
): string {
  const p = plan.reason_params;
  const step = formatWeight(t, locale, p.step_kg ?? 0, units);
  const below = { set: p.set_number, count: p.reps ?? 0, min: p.rep_min };

  switch (plan.reason_code) {
    case 'increase':
      return t('reason.increase', { step, count: p.sets ?? 0, reps: p.reps });
    case 'increase_fast':
      return t('reason.increase_fast', { step, reps: p.reps });
    case 'same':
      return t('reason.same', { target: p.target_reps, set: p.set_number });
    case 'retry':
      return t('reason.retry', below);
    case 'reduce_offer':
      return t('reason.reduce_offer', below);
    case 'reduced':
      return t('reason.reduced', below);
    case 'reps_only':
      return t('reason.reps_only', { target: p.target_reps, set: p.set_number });
    case 'find_weight':
      return t('reason.find_weight');
  }
}
