import { shiftDate, type WeightEntry, weightStats } from '@mvp/domain';
import type { ActivityLogRow } from '@mvp/schemas';
import type { TFunction } from 'i18next';

import type { WorkoutRecord } from '@/data/history';
import type { SummaryExercise } from '@/data/sessions';

import { formatActivity, formatCardio, formatDuration, formatNumber, toLocalDate } from './format';

interface ReportContext {
  t: TFunction;
  locale: string;
  /** The name of an exercise in the user's language. */
  nameOf: (exerciseId: string) => string;
  weights: readonly WeightEntry[];
}

const kg = ({ t, locale }: ReportContext, value: number) =>
  t('units.kg', { value: formatNumber(value, locale) });

const shortDate = (locale: string, date: Date | string, year = true) =>
  new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    ...(year && { year: 'numeric' }),
  }).format(typeof date === 'string' ? new Date(date) : date);

/**
 * What was done in an exercise: "80 кг: 12, 12, 11", "12, 10", "60 с, 45 с" or, for cardio,
 * "25 мин, 4,2 км, пульс 145".
 */
function done(ctx: ReportContext, { sets }: SummaryExercise, colon: boolean): string {
  const lifted = sets.filter((set) => set.reps !== null);
  if (lifted.length === 0) {
    const parts = sets.map((set) => formatCardio(ctx.t, ctx.locale, set));
    // Sets that say more than their time are parted more clearly than "60 с, 45 с".
    return parts.join(parts.some((part) => part.includes(',')) ? '; ' : ', ');
  }
  // No weight and a weight of zero are the same thing here: the body's own weight.
  const weightOf = (set: (typeof lifted)[number]) => set.weight_kg || null;
  const weights = [...new Set(lifted.map(weightOf))];
  const [only] = weights;
  // One weight for all the sets is written once; different weights go with their sets.
  if (weights.length === 1) {
    const reps = lifted.map((set) => set.reps).join(', ');
    return only == null ? reps : `${kg(ctx, only)}${colon ? ':' : ''} ${reps}`;
  }
  return lifted
    .map((set) => {
      const weight = weightOf(set);
      return weight === null ? `${set.reps}` : `${kg(ctx, weight)} × ${set.reps}`;
    })
    .join(', ');
}

/** The mark of an exercise that set a personal record in the workout. */
const recordMark = (ctx: ReportContext, entry: SummaryExercise) =>
  entry.records.length > 0 || entry.cardioRecords.length > 0 ? ctx.t('report.record') : '';

function exerciseLine(ctx: ReportContext, entry: SummaryExercise): string {
  const text = done(ctx, entry, true);
  const separator = text.includes(':') || !/^\d/.test(text) ? ' ' : ': ';
  const rir = entry.sets.at(-1)?.rir;
  const next = entry.plan?.next_weight_kg;
  return [
    `${ctx.nameOf(entry.exercise.exercise_id)}${separator}${text}`,
    rir != null ? `(RIR ${rir})` : '',
    next != null ? ctx.t('report.next', { weight: kg(ctx, next) }) : '',
    recordMark(ctx, entry),
  ]
    .filter(Boolean)
    .join(' ');
}

/** The lines of the exercises of a workout; a superset is one line. */
function exerciseLines(ctx: ReportContext, workout: WorkoutRecord): string[] {
  const lines: string[] = [];
  const groupOf = (entry: SummaryExercise) =>
    entry.item?.superset_group != null
      ? `${entry.item.program_day_id}:${entry.item.superset_group}`
      : null;

  const entries = workout.exercises.filter((entry) => entry.sets.length > 0);
  for (let index = 0; index < entries.length; ) {
    const entry = entries[index] as SummaryExercise;
    const group = groupOf(entry);
    let end = index + 1;
    while (group !== null && end < entries.length && groupOf(entries[end] as SummaryExercise) === group) end++;

    if (end - index > 1) {
      const items = entries
        .slice(index, end)
        .map((member) =>
          [ctx.nameOf(member.exercise.exercise_id), done(ctx, member, false), recordMark(ctx, member)]
            .filter(Boolean)
            .join(' '),
        )
        .join(' + ');
      lines.push(ctx.t('report.superset', { items }));
    } else {
      lines.push(exerciseLine(ctx, entry));
    }
    index = end;
  }
  return lines;
}

function totals(ctx: ReportContext, workouts: readonly WorkoutRecord[]): string {
  const volume = Math.round(workouts.reduce((sum, workout) => sum + workout.volumeKg, 0));
  const duration = formatDuration(
    ctx.t,
    // A report rounds the time to minutes.
    Math.max(60, Math.round(workouts.reduce((sum, w) => sum + w.durationSec, 0) / 60) * 60),
  );
  // Cardio alone lifts nothing: no "volume 0 kg".
  return volume > 0
    ? ctx.t('report.totals', { volume: kg(ctx, volume), duration })
    : ctx.t('report.totalsTime', { duration });
}

/** The line about the morning weight on a day, if there is anything to say. */
function weightLine(ctx: ReportContext, date: string): string | null {
  const stats = weightStats(ctx.weights, date);
  if (stats.today !== null) {
    return stats.average7 !== null
      ? ctx.t('report.morningWeightAverage', {
          weight: kg(ctx, stats.today),
          average: formatNumber(Math.round(stats.average7 * 10) / 10, ctx.locale),
        })
      : ctx.t('report.morningWeight', { weight: kg(ctx, stats.today) });
  }
  return stats.average7 !== null
    ? ctx.t('report.averageOnly', { average: kg(ctx, Math.round(stats.average7 * 10) / 10) })
    : null;
}

function workoutBlock(ctx: ReportContext, workout: WorkoutRecord): string[] {
  return [
    ctx.t('report.workoutHeader', {
      number: workout.number,
      day: workout.dayTitle,
      date: shortDate(ctx.locale, workout.session.started_at),
    }),
    ...exerciseLines(ctx, workout),
  ];
}

export type ReportKind =
  | { kind: 'session'; workout: WorkoutRecord }
  | { kind: 'cycle'; workouts: WorkoutRecord[]; cycle: number; program: string }
  | { kind: 'week'; workouts: WorkoutRecord[]; activities: ActivityLogRow[]; today: string };

/** The activities of a week outside the program, one line each, and what they add up to. */
function activityBlock(ctx: ReportContext, activities: readonly ActivityLogRow[]): string[] {
  if (activities.length === 0) return [];
  const minutes = Math.round(activities.reduce((sum, a) => sum + a.duration_sec, 0) / 60);
  return [
    ctx.t('report.activities'),
    ...activities.map(
      (activity) =>
        `${shortDate(ctx.locale, activity.started_at, false)} ${formatActivity(ctx.t, ctx.locale, activity)}`,
    ),
    ctx.t('report.activitiesTotal', {
      count: activities.length,
      duration: formatDuration(ctx.t, Math.max(1, minutes) * 60),
    }),
  ];
}

/**
 * The text of a report, ready for a messenger (spec 6.6). Nothing is stored: a report is
 * put together from workouts, plans and weights whenever it is asked for.
 */
export function buildReport(ctx: ReportContext, report: ReportKind): string {
  const blocks: (string | null)[][] = [];

  if (report.kind === 'session') {
    const { workout } = report;
    const [header, ...lines] = workoutBlock(ctx, workout);
    blocks.push(
      [header ?? '', weightLine(ctx, toLocalDate(new Date(workout.session.started_at)))],
      lines,
      [totals(ctx, [workout])],
    );
  } else {
    const { workouts } = report;
    const header =
      report.kind === 'cycle'
        ? ctx.t('report.cycleHeader', { cycle: report.cycle, program: report.program })
        : ctx.t('report.weekHeader', {
            from: shortDate(ctx.locale, `${shiftDate(report.today, -6)}T12:00:00`, false),
            to: shortDate(ctx.locale, `${report.today}T12:00:00`, false),
          });
    const activities = report.kind === 'week' ? report.activities : [];
    blocks.push([header, report.kind === 'week' ? weightLine(ctx, report.today) : null]);
    if (workouts.length === 0 && activities.length === 0) {
      blocks.push([ctx.t(report.kind === 'week' ? 'report.emptyWeek' : 'report.empty')]);
    }
    for (const workout of workouts) blocks.push(workoutBlock(ctx, workout));
    if (workouts.length > 0) {
      blocks.push([
        `${ctx.t('report.workouts', { count: workouts.length })} · ${totals(ctx, workouts)}`,
      ]);
    }
    blocks.push(activityBlock(ctx, activities));
  }

  return blocks
    .map((block) => block.filter((line): line is string => Boolean(line)).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}
