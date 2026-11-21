import { create } from 'zustand';

import { settingsStorage } from './storage';

export interface PlannedWorkout {
  programId: string;
  dayId: string;
  time: string;
}

type Plans = Partial<Record<string, PlannedWorkout>>;
const key = 'week.planned-workouts';

function readPlans(): Plans {
  try {
    return JSON.parse(settingsStorage.get(key) ?? '{}') as Plans;
  } catch {
    return {};
  }
}

export const usePlannedWorkouts = create<{
  plans: Plans;
  save(date: string, plan: PlannedWorkout | null): void;
}>((set, get) => ({
  plans: readPlans(),
  save(date, plan) {
    const plans = { ...get().plans };
    if (plan) plans[date] = plan;
    else delete plans[date];
    settingsStorage.set(key, JSON.stringify(plans));
    set({ plans });
  },
}));
