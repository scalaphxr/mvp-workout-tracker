import type { FocusContext } from '@mvp/domain';
import type { Level } from '@mvp/schemas';
import { create } from 'zustand';

import { getProgramTree } from '@/data/programs';
import { knownExercises } from '@/data/sessions';

import { useCatalog } from './catalog';
import { useGym } from './gym';
import { useActiveProgram, useLocal } from './local';
import { usePreferences } from './preferences';

/** The level exercises are picked for when the questionnaire has not been asked. */
const DEFAULT_LEVEL: Level = 'intermediate';

/** What exercises for chosen muscles are picked from: the main gym and the user's level. */
export function useFocusContext(): FocusContext {
  const { catalog } = useCatalog();
  const gym = useGym();
  const lastLevel = usePreferences((state) => state.lastAnswers?.level);
  const programId = useActiveProgram((state) => state.id);
  const known = useLocal(knownExercises);
  const programLevel = useLocal(
    (ctx) => (programId ? getProgramTree(ctx, programId)?.program.level : null),
    [programId],
  );

  return {
    exercises: catalog.exercises,
    equipment: gym?.equipment ?? null,
    level: lastLevel ?? programLevel ?? DEFAULT_LEVEL,
    known,
  };
}

interface FocusEdits {
  /** The exercises the user picked instead of the planned ones, by planned exercise id. */
  replaced: Record<string, string>;
  /** Planned exercises the user took out. */
  removed: string[];
  replace(plannedId: string, exerciseId: string): void;
  remove(plannedId: string): void;
  reset(): void;
}

/** Changes to the preview of a workout: the exercise picker makes them from its own screen. */
export const useFocusEdits = create<FocusEdits>((set) => ({
  replaced: {},
  removed: [],
  replace: (plannedId, exerciseId) =>
    set((state) => ({ replaced: { ...state.replaced, [plannedId]: exerciseId } })),
  remove: (plannedId) => set((state) => ({ removed: [...state.removed, plannedId] })),
  reset: () => set({ replaced: {}, removed: [] }),
}));
