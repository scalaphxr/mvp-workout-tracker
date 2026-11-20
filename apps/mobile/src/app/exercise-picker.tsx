import { useLocalSearchParams, useRouter } from 'expo-router';

import { ExerciseBrowser } from '@/components/exercise-browser';
import { addItem, getItem, getProgramTree, replaceExercise } from '@/data/programs';
import { addFreeExercise } from '@/data/sessions';
import { useFocusEdits } from '@/lib/focus-workout';
import { useFreeWorkoutFocus } from '@/lib/free-workout';
import { useImportDraft } from '@/lib/import-draft';
import { itemDefaults } from '@/lib/item-defaults';
import { useLibraryFilters } from '@/lib/library-filters';
import { mutate, useLocal } from '@/lib/local';

/**
 * The library as a picker. With `dayId` the picked exercise is added to that day of
 * `programId`; with `itemId` it replaces the exercise of that item; with `importDay` and
 * `importItem` it is the pick for a line of a program being imported from text; with
 * `sessionId` it goes into that workout without a program; with `focusItem` it takes the place
 * of that exercise in the preview of a workout for chosen muscles.
 */
export default function ExercisePickerScreen() {
  const params = useLocalSearchParams<{
    programId?: string;
    dayId?: string;
    itemId?: string;
    importDay?: string;
    importItem?: string;
    sessionId?: string;
    focusItem?: string;
  }>();
  const router = useRouter();
  const goal = useLocal(
    (ctx) => (params.programId ? (getProgramTree(ctx, params.programId)?.program.goal ?? null) : null),
    [params.programId],
  );

  return (
    <ExerciseBrowser
      onSelect={(exercise) => {
        // A pick is a one-off search: the next picker opens on the whole library, not on
        // what was typed for this one (the text used to stay and the next one was added to it).
        useLibraryFilters.getState().setQuery('');
        if (params.importDay !== undefined && params.importItem !== undefined) {
          // The draft is not in the database yet: the pick goes to the draft.
          useImportDraft
            .getState()
            .choose(Number(params.importDay), Number(params.importItem), exercise.id);
          router.back();
          return;
        }
        const { focusItem, sessionId } = params;
        if (focusItem) {
          useFocusEdits.getState().replace(focusItem, exercise.id);
          router.back();
          return;
        }
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
