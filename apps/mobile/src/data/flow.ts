/** An exercise of a workout, as the order of sets sees it. */
export interface FlowExercise {
  id: string;
  /** Exercises with the same group are a superset. */
  group: string | null;
  /** Sets done, the one just logged included. */
  done: number;
  planned: number;
  rest_sec: number;
}

/**
 * What comes after a set of `currentId`: which exercise is next and how long to rest first.
 * In a superset the exercises alternate without rest, and the timer starts after the last
 * one of the round. `nextId` is `null` when every planned set of the workout is done.
 */
export function afterSet(
  exercises: readonly FlowExercise[],
  currentId: string,
): { nextId: string | null; rest_sec: number } {
  const index = exercises.findIndex((exercise) => exercise.id === currentId);
  const current = exercises[index];
  if (!current) return { nextId: null, rest_sec: 0 };
  const left = (exercise: FlowExercise) => exercise.done < exercise.planned;
  // The next exercise with sets left, looking forward from the current one and then around.
  const onwards = [...exercises.slice(index + 1), ...exercises.slice(0, index)].find(left);

  if (current.group !== null) {
    const members = exercises.filter((exercise) => exercise.group === current.group);
    const at = members.findIndex((exercise) => exercise.id === currentId);
    const later = members.slice(at + 1).find(left);
    if (later) return { nextId: later.id, rest_sec: 0 };
    // The round of the superset is over: rest, then start it again or move on.
    const again = members.find(left);
    return { nextId: again?.id ?? onwards?.id ?? null, rest_sec: again || onwards ? current.rest_sec : 0 };
  }

  if (left(current)) return { nextId: current.id, rest_sec: current.rest_sec };
  return { nextId: onwards?.id ?? null, rest_sec: onwards ? current.rest_sec : 0 };
}
