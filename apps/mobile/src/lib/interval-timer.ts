import {
  type IntervalPhase,
  type IntervalPlan,
  intervalPhases,
  intervalTotalSec,
} from '@mvp/domain';
import type { TFunction } from 'i18next';
import { create } from 'zustand';

import i18n from '@/i18n';

import { cancelAlert, scheduleIntervalAlerts } from './feedback';
import { formatDuration } from './format';

export interface IntervalRun {
  title: string;
  plan: IntervalPlan;
  phases: IntervalPhase[];
  /** When the timer would have started had it never been paused, ms since epoch. */
  startedAt: number;
  /** Milliseconds run when paused; `null` – running. */
  pausedAt: number | null;
}

interface IntervalTimer {
  run: IntervalRun | null;
  /** The scheduled notifications of the coming phases. */
  notifications: string[];
  start(title: string, plan: IntervalPlan): void;
  pause(): void;
  resume(): void;
  stop(): void;
  /** Schedules the notifications again: iOS keeps only so many, so they are topped up. */
  refreshAlerts(): void;
}

/** Milliseconds the timer has run. */
export const elapsedMs = (run: IntervalRun, now = Date.now()) => run.pausedAt ?? now - run.startedAt;

/** "Work", "Rest"… */
export const phaseTitle = (phase: IntervalPhase) => i18n.t(`interval.phase.${phase.kind}`);

/** "Round 3 of 8", with the cycle when there is more than one. */
export function phaseProgress(phase: IntervalPhase, plan: IntervalPlan): string {
  const round = i18n.t('interval.round', { round: phase.round, rounds: plan.rounds });
  if (plan.cycles === 1) return round;
  return `${round} · ${i18n.t('interval.cycle', { cycle: phase.cycle, cycles: plan.cycles })}`;
}

/** "20 s / 10 s × 8, 4 min in all" – a preset in one line. */
export function planSummary(t: TFunction, plan: IntervalPlan): string {
  const work = formatDuration(t, plan.work_sec);
  const parts = [
    plan.rest_sec === 0
      ? t('interval.planNoRest', { work, rounds: plan.rounds })
      : t('interval.plan', { work, rest: formatDuration(t, plan.rest_sec), rounds: plan.rounds }),
  ];
  if (plan.cycles > 1) parts.push(t('interval.cycles', { count: plan.cycles }));
  parts.push(
    t('interval.total', { time: formatDuration(t, intervalTotalSec(intervalPhases(plan, 0))) }),
  );
  return parts.join(', ');
}

/** What the lock screen shows at the start of every phase and when the timer is over. */
function alertsOf(run: IntervalRun) {
  const now = Date.now();
  const alerts = run.phases.slice(1).map((phase) => ({
    at: run.startedAt + phase.start_sec * 1000,
    title: phaseTitle(phase),
    body: phaseProgress(phase, run.plan),
  }));
  alerts.push({
    at: run.startedAt + intervalTotalSec(run.phases) * 1000,
    title: i18n.t('interval.doneTitle'),
    body: run.title,
  });
  return alerts.filter((alert) => alert.at > now);
}

/**
 * The interval timer. Like the rest timer, it is kept as the moment it started, not as a
 * count-down, so it stays right in the background and with the screen locked; the changes of
 * phase the user cannot see arrive as notifications with sound and vibration.
 */
export const useIntervalTimer = create<IntervalTimer>((set, get) => {
  // Grows with every change of the schedule: notifications scheduled for an older one are dropped.
  let generation = 0;

  const cancelAll = () => {
    generation++;
    get().notifications.forEach(cancelAlert);
    set({ notifications: [] });
  };

  const schedule = () => {
    cancelAll();
    const { run } = get();
    if (!run || run.pausedAt !== null) return;
    const current = generation;
    void scheduleIntervalAlerts(alertsOf(run), i18n.t('interval.channel')).then((ids) => {
      // The timer may have been paused or stopped while the notifications were being scheduled.
      if (generation === current) set({ notifications: ids });
      else ids.forEach(cancelAlert);
    });
  };

  return {
    run: null,
    notifications: [],
    start(title, plan) {
      set({ run: { title, plan, phases: intervalPhases(plan), startedAt: Date.now(), pausedAt: null } });
      schedule();
    },
    pause() {
      const { run } = get();
      if (!run || run.pausedAt !== null) return;
      set({ run: { ...run, pausedAt: elapsedMs(run) } });
      cancelAll();
    },
    resume() {
      const { run } = get();
      if (!run || run.pausedAt === null) return;
      set({ run: { ...run, startedAt: Date.now() - run.pausedAt, pausedAt: null } });
      schedule();
    },
    stop() {
      cancelAll();
      set({ run: null });
    },
    refreshAlerts: schedule,
  };
});
