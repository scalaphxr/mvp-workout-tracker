import { useLocalSearchParams, useRouter } from 'expo-router';

import { ExerciseBrowser } from '@/components/exercise-browser';
import { addItem, getItem, getProgramTree, replaceExercise } from '@/data/programs';
import { addFreeExercise } from '@/data/sessions';
import { useFreeWorkoutFocus } from '@/lib/free-workout';
import { useImportDraft } from '@/lib/import-draft';
import { itemDefaults } from '@/lib/item-defaults';
import { mutate, useLocal } from '@/lib/local';

/**
 * The library as a picker. With `dayId` the picked exercise is added to that day of
 * `programId`; with `itemId` it replaces the exercise of that item; with `importDay` and
 * `importItem` it is the pick for a line of a program being imported from text; with
 * `sessionId` it goes into that workout without a program.
 */
export default function ExercisePickerScreen() {
  const params = useLocalSearchParams<{
    programId?: string;
    dayId?: string;
    itemId?: string;
    importDay?: string;
    importItem?: string;
    sessionId?: string;
  }>();
  const router = useRouter();
  const goal = useLocal((ctx) =>
    params.programId ? (getProgramTree(ctx, params.programId)?.program.goal ?? null) : null,
  );

  return (
    <ExerciseBrowser
      onSelect={(exercise) => {
        if (params.importDay !== undefined && params.importItem !== undefined) {
          // The draft is not in the database yet: the pick goes to the draft.
          useImportDraft
            .getState()
            .choose(Number(params.importDay), Number(params.importItem), exercise.id);
          router.back();
          return;
        }
        const { sessionId } = params;
        if (sessionId) {
          const entry = mutate((ctx) => addFreeExercise(ctx, sessionId, exercise.id));
          useFreeWorkoutFocus.getState().set(entry.id);
          router.back();
          return;
        }
        mutate((ctx) => {
          const { dayId, itemId } = params;
          if (itemId && getItem(ctx, itemId)) replaceExercise(ctx, itemId, exercise.id);
          else if (dayId) addItem(ctx, dayId, exercise.id, itemDefaults(exercise, goal));
        });
        // A replacement was opened from the list of alternatives: go back past it.
        if (params.itemId) router.dismiss(2);
        else router.back();
      }}
    />
  );
}
