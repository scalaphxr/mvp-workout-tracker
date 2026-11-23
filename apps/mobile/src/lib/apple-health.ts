import { useQuery } from '@tanstack/react-query';
import { isRunningInExpoGo } from 'expo';
import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { toLocalDate } from './format';
import { settingsStorage } from './storage';
import { parseWeekDate } from './week';

const METRICS = [
  { key: 'steps', identifier: 'HKQuantityTypeIdentifierStepCount', unit: 'count' },
  { key: 'walkRunDistance', identifier: 'HKQuantityTypeIdentifierDistanceWalkingRunning', unit: 'm' },
  { key: 'cyclingDistance', identifier: 'HKQuantityTypeIdentifierDistanceCycling', unit: 'm' },
  { key: 'swimmingDistance', identifier: 'HKQuantityTypeIdentifierDistanceSwimming', unit: 'm' },
  { key: 'activeEnergy', identifier: 'HKQuantityTypeIdentifierActiveEnergyBurned', unit: 'kcal' },
  { key: 'exerciseTime', identifier: 'HKQuantityTypeIdentifierAppleExerciseTime', unit: 'min' },
  { key: 'standTime', identifier: 'HKQuantityTypeIdentifierAppleStandTime', unit: 'min' },
  { key: 'flights', identifier: 'HKQuantityTypeIdentifierFlightsClimbed', unit: 'count' },
] as const;

const PREF = 'appleHealth.readActivity';
export const APPLE_HEALTH_QUERY = ['apple-health'] as const;
export const supportsAppleHealth = Platform.OS === 'ios' && !isRunningInExpoGo();

export const useAppleHealthAccess = create<{ enabled: boolean; setEnabled(enabled: boolean): void }>((set) => ({
  enabled: supportsAppleHealth && settingsStorage.get(PREF) === '1',
  setEnabled(enabled) {
    if (enabled) settingsStorage.set(PREF, '1');
    else settingsStorage.remove(PREF);
    set({ enabled });
  },
}));

async function loadHealthKit() {
  if (!supportsAppleHealth) throw new Error('This build does not have HealthKit');
  const kit = await import('@kingstinct/react-native-healthkit');
  if (!kit.isHealthDataAvailable()) throw new Error('HealthKit is unavailable on this device');
  return kit;
}

export async function requestAppleHealthAccess(): Promise<boolean> {
  const kit = await loadHealthKit();
  return kit.requestAuthorization({
    toRead: [kit.WorkoutTypeIdentifier, ...METRICS.map(({ identifier }) => identifier)],
  });
}

type HealthKit = Awaited<ReturnType<typeof loadHealthKit>>;

async function workoutsBetween(kit: HealthKit, startDate: Date, endDate: Date) {
  const workouts = await kit.queryWorkoutSamples({
    filter: { date: { startDate, endDate, strictStartDate: true } },
    limit: 0,
    ascending: true,
  });
  return workouts.filter(({ startDate }) => startDate < endDate);
}

function dailyTotals(kit: HealthKit, metric: typeof METRICS[number], startDate: Date, endDate: Date) {
  return kit.queryStatisticsCollectionForQuantity(metric.identifier, ['cumulativeSum'], startDate, { day: 1 }, {
    unit: metric.unit,
    filter: { date: { startDate, endDate } },
  });
}

async function readDailyTotal(kit: HealthKit, metric: typeof METRICS[number], start: Date) {
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  const totals = await dailyTotals(kit, metric, start, end);
  const value = totals.find(({ startDate }) => startDate?.getTime() === start.getTime())?.sumQuantity?.quantity;
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

async function readDay(start: Date) {
  const kit = await loadHealthKit();
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  const [training, ...quantities] = await Promise.allSettled([
    workoutsBetween(kit, start, end),
    ...METRICS.map(async (metric) => {
      const value = await readDailyTotal(kit, metric, start);
      return value === null ? null : { ...metric, value };
    }),
  ]);
  const failed = quantities.filter(({ status }) => status === 'rejected').length + Number(training.status === 'rejected');
  if (failed === METRICS.length + 1) throw new Error('Could not read activity from HealthKit');
  return {
    partial: failed > 0,
    metrics: quantities.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []),
    workouts: training.status === 'fulfilled' ? training.value.map((workout) => ({
      id: workout.uuid,
      activity: kit.WorkoutActivityType[workout.workoutActivityType] ?? 'other',
      startedAt: workout.startDate.toISOString(),
      seconds: workout.duration.quantity,
      meters: workout.totalDistance?.quantity,
      kcal: workout.totalEnergyBurned?.quantity,
    })) : [],
  };
}

async function readMonth(start: Date) {
  const kit = await loadHealthKit();
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const [steps, workouts] = await Promise.allSettled([
    dailyTotals(kit, METRICS[0], start, end),
    workoutsBetween(kit, start, end),
  ]);
  if (steps.status === 'rejected' && workouts.status === 'rejected') throw new Error('Could not read HealthKit dates');

  const days = new Set<string>();
  if (steps.status === 'fulfilled') {
    for (const { startDate, sumQuantity } of steps.value) {
      if (startDate && startDate < end && (sumQuantity?.quantity ?? 0) > 0) days.add(toLocalDate(startDate));
    }
  }
  if (workouts.status === 'fulfilled') {
    for (const { startDate } of workouts.value) days.add(toLocalDate(startDate));
  }
  return days;
}

function useHealthQuery<T>(kind: 'day' | 'month' | 'steps', date: Date | null, read: (date: Date) => Promise<T>) {
  const focused = useIsFocused();
  const enabled = useAppleHealthAccess((state) => state.enabled) && supportsAppleHealth && date !== null;
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: [...APPLE_HEALTH_QUERY, kind, date ? toLocalDate(date) : null],
    enabled: enabled && focused,
    queryFn: () => read(date!),
    gcTime: 0,
    retry: false,
  });
  useEffect(() => {
    if (!enabled || !focused) return;
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => listener.remove();
  }, [enabled, focused, refetch]);
  return { enabled, data: enabled && !isError ? data : undefined, isFetching, isError, refetch };
}

export function useAppleHealthDay(date: string) {
  return useHealthQuery('day', date <= toLocalDate(new Date()) ? parseWeekDate(date) : null, readDay);
}

async function readSteps(start: Date) {
  return readDailyTotal(await loadHealthKit(), METRICS[0], start);
}

export function useAppleHealthSteps(date: string): number | null {
  return useHealthQuery('steps', date <= toLocalDate(new Date()) ? parseWeekDate(date) : null, readSteps).data ?? null;
}

export function useAppleHealthMonth(month: Date) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  return useHealthQuery('month', start <= new Date() ? start : null, readMonth);
}
