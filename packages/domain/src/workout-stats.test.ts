import type { Exercise } from '@mvp/schemas';
import { describe, expect, it } from 'vitest';

import { setsByMuscleGroup, STRENGTH_MET, workoutKcal } from './workout-stats';

describe('workoutKcal', () => {
  it('is MET × body weight × hours for a weight workout', () => {
    // 83 kg, 1 hour: 3.5 × 83 = 290.5 → 291.
    expect(workoutKcal({ durationSec: 3600, bodyWeightKg: 83, logged: [] })).toBe(291);
    expect(STRENGTH_MET).toBe(3.5);
  });

  it('grows with the time and with the body weight', () => {
    const at = (min: number, kg: number) => workoutKcal({ durationSec: min * 60, bodyWeightKg: kg, logged: [] })!;
    expect(at(90, 83)).toBeGreaterThan(at(60, 83));
    expect(at(60, 95)).toBeGreaterThan(at(60, 70));
    expect(at(0, 83)).toBe(0);
  });

  it('counts cardio by the calories from the machine instead of by the time it took', () => {
    // 60 min, of which 20 min on a treadmill showing 250 kcal: 250 + 3.5 × 80 × 40/60.
    const kcal = workoutKcal({
      durationSec: 3600,
      bodyWeightKg: 80,
      logged: [{ duration_sec: 1200, calories: 250 }],
    });
    expect(kcal).toBe(Math.round(250 + (3.5 * 80 * 40) / 60));
  });

  it('ignores sets without calories and never counts negative time', () => {
    const logged = [
      { duration_sec: 600, calories: null },
      { duration_sec: 5000, calories: 400 },
    ];
    expect(workoutKcal({ durationSec: 3600, bodyWeightKg: 80, logged })).toBe(400);
  });

  it('without a body weight: only what the machine showed, else nothing', () => {
    expect(workoutKcal({ durationSec: 3600, bodyWeightKg: null, logged: [] })).toBeNull();
    expect(
      workoutKcal({ durationSec: 3600, bodyWeightKg: null, logged: [{ duration_sec: 900, calories: 120.4 }] }),
    ).toBe(120);
  });
});

const exercise = (kind: Exercise['kind'], ...primary_muscles: string[]) => ({ kind, primary_muscles });

describe('setsByMuscleGroup', () => {
  it('adds up the work sets of each group, the most worked first', () => {
    expect(
      setsByMuscleGroup([
        { exercise: exercise('strength', 'chest'), sets: 3 }, // incline press
        { exercise: exercise('strength', 'chest'), sets: 3 }, // chest press
        { exercise: exercise('strength', 'side_delts'), sets: 3 },
        { exercise: exercise('strength', 'chest'), sets: 3 }, // pec deck
        { exercise: exercise('strength', 'chest'), sets: 3 },
        { exercise: exercise('strength', 'side_delts'), sets: 3 },
        { exercise: exercise('strength', 'rear_delts'), sets: 3 },
      ]),
    ).toEqual([
      { category: 'chest', sets: 12, muscles: [{ code: 'chest', sets: 12 }] },
      {
        category: 'shoulders',
        sets: 9,
        muscles: [
          { code: 'side_delts', sets: 6 },
          { code: 'rear_delts', sets: 3 },
        ],
      },
    ]);
  });

  it('counts a set once per group even when it works two muscles of it', () => {
    const [legs] = setsByMuscleGroup([{ exercise: exercise('strength', 'quads', 'glutes'), sets: 3 }]);
    expect(legs).toEqual({
      category: 'legs',
      sets: 3,
      muscles: [
        { code: 'quads', sets: 3 },
        { code: 'glutes', sets: 3 },
      ],
    });
  });

  it('counts a set for every group its main muscles belong to', () => {
    // A row with the lats and the biceps as its main muscles: back and arms.
    const groups = setsByMuscleGroup([{ exercise: exercise('strength', 'lats', 'biceps'), sets: 4 }]);
    expect(groups.map((g) => [g.category, g.sets])).toEqual([
      ['back', 4],
      ['arms', 4],
    ]);
  });

  it('leaves out cardio, stretching, exercises not done and unknown muscles', () => {
    expect(
      setsByMuscleGroup([
        { exercise: exercise('cardio', 'quads'), sets: 1 },
        { exercise: exercise('stretch', 'hamstrings'), sets: 2 },
        { exercise: exercise('strength', 'chest'), sets: 0 },
        { exercise: exercise('strength', 'tail'), sets: 3 },
      ]),
    ).toEqual([]);
  });

  it('counts holds and body-weight exercises', () => {
    const groups = setsByMuscleGroup([
      { exercise: exercise('timed', 'abs'), sets: 3 },
      { exercise: exercise('bodyweight', 'lats'), sets: 3 },
    ]);
    expect(groups.map((g) => [g.category, g.sets])).toEqual([
      ['back', 3],
      ['core', 3],
    ]);
  });
});
