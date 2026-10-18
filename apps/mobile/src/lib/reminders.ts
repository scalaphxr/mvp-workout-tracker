import { useEffect } from 'react';
import { AppState } from 'react-native';

import { listWeights } from '@/data/body';
import { finishedWorkoutTimes } from '@/data/history';
import i18n from '@/i18n';

import { data } from './db';
import { replaceReminders } from './feedback';
import { toLocalDate } from './format';
import { useActiveProgram, useLocal } from './local';
import { usePreferences } from './preferences';
import { planReminders, type ReminderKind } from './reminder-plan';
import { weeklyGoalOf } from './weekly-goal';

const TEXTS: Record<ReminderKind, { title: string; body: string }> = {
  workout: { title: 'reminders.workoutTitle', body: 'reminders.workoutBody' },
  weight: { title: 'reminders.weightTitle', body: 'reminders.weightBody' },
  inactive: { title: 'reminders.inactiveTitle', body: 'reminders.inactiveBody' },
};

/** Plans the reminders of the coming week again, from what is on the phone right now. */
export async function rescheduleReminders(): Promise<void> {
  const ctx = data();
  const { reminders, weeklyGoal } = usePreferences.getState();
  const now = new Date();
  const planned = planReminders(reminders, {
    now,
    workouts: finishedWorkoutTimes(ctx).map((time) => new Date(time)),
    weightToday: listWeights(ctx).some((entry) => entry.date === toLocalDate(now)),
    weeklyGoal: weeklyGoalOf(ctx, weeklyGoal, useActiveProgram.getState().id),
  });
  await replaceReminders(
    planned.map(({ kind, at }) => ({
      at,
      title: i18n.t(TEXTS[kind].title as 'reminders.workoutTitle'),
      body: i18n.t(TEXTS[kind].body as 'reminders.workoutBody'),
    })),
    i18n.t('reminders.channel'),
  );
}

/**
 * Keeps the reminders in step with the data: a workout done or a weight entered takes back
 * the reminder it made pointless. Runs at launch, on every change and back from the background.
 */
export function useReminderDriver(): void {
  const reminders = usePreferences((state) => state.reminders);
  const goal = usePreferences((state) => state.weeklyGoal);
  const programId = useActiveProgram((state) => state.id);
  // What the plan depends on, as one value that changes when any of it does.
  const key = useLocal((ctx) => {
    const times = finishedWorkoutTimes(ctx);
    const weights = listWeights(ctx);
    return `${times.length}:${times.at(-1)}:${weights.length}:${weights.at(-1)?.date}`;
  });

  useEffect(() => {
    void rescheduleReminders().catch(() => {});
  }, [reminders, goal, programId, key]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void rescheduleReminders().catch(() => {});
    });
    return () => subscription.remove();
  }, []);
}
