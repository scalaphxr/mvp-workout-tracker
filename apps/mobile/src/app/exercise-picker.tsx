import { defaultItemParams } from '@mvp/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ExerciseBrowser } from '@/components/exercise-browser';
import { addItem, getItem, getProgramTree, replaceExercise } from '@/data/programs';
import { mutate, useLocal } from '@/lib/local';

/**
 * The library as a picker. With `dayId` the picked exercise is added to that day of
 * `programId`; with `itemId` it replaces the exercise of that item.
 */
export default function ExercisePickerScreen() {
  const params = useLocalSearchParams<{ programId?: string; dayId?: string; itemId?: string }>();
  const router = useRouter();
  const goal = useLocal((ctx) =>
    params.programId ? (getProgramTree(ctx, params.programId)?.program.goal ?? null) : null,
  );

  return (
    <ExerciseBrowser
      onSelect={(exercise) => {
        mutate((ctx) => {
          const { dayId, itemId } = params;
          if (itemId && getItem(ctx, itemId)) replaceExercise(ctx, itemId, exercise.id);
          else if (dayId) addItem(ctx, dayId, exercise.id, defaultItemParams(exercise, goal));
        });
        // A replacement was opened from the list of alternatives: go back past it.
        if (params.itemId) router.dismiss(2);
        else router.back();
      }}
    />
  );
}
