import { createInstance, type TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import type { ActivityLogRow } from '@mvp/schemas';

import type { WorkoutRecord } from '../data/history';
import type { SummaryExercise } from '../data/sessions';
import en from '../i18n/locales/en.json';
import ru from '../i18n/locales/ru.json';
import { buildReport } from './report';

const NAMES: Record<string, string> = {
  bench: 'Жим лёжа',
  incline: 'Жим гантелей на наклонной',
  hammer: 'молотки',
  pushdown: 'разгибания на канате',
  pullup: 'Подтягивания',
  plank: 'Планка',
  treadmill: 'Бег на дорожке',
};

async function context(locale: 'ru' | 'en') {
  const i18n = createInstance();
  await i18n.init({
    resources: { en: { translation: en }, ru: { translation: ru } },
    lng: locale,
    interpolation: { escapeValue: false },
  });
  return {
    t: i18n.t as TFunction,
    locale,
    nameOf: (id: string) => NAMES[id] ?? id,
    weights: [
      { date: '2026-09-29', weight_kg: 85.2 },
      { date: '2026-09-30', weight_kg: 85 },
      { date: '2026-10-01', weight_kg: 84.8 },
      { date: '2026-10-02', weight_kg: 84.6 },
    ],
  };
}

interface Done {
  id: string;
  record?: boolean;
  sets: {
    weight?: number | null;
    reps?: number;
    rir?: number;
    sec?: number;
    meters?: number;
    kmh?: number;
    incline?: number;
    hr?: number;
  }[];
  next?: number;
  superset?: number;
}

/** A finished workout with only the fields a report reads. */
const workout = (number: number, day: string, date: string, minutes: number, volume: number, done: Done[]) =>
  ({
    session: { started_at: new Date(`${date}T09:00:00`).toISOString() },
    number,
    dayTitle: day,
    programTitle: 'Масса',
    volumeKg: volume,
    durationSec: minutes * 60,
    exercises: done.map(
      ({ id, sets, next, superset, record }) =>
        ({
          exercise: { exercise_id: id },
          item: { program_day_id: day, superset_group: superset ?? null },
          sets: sets.map((set) => ({
            weight_kg: set.weight ?? null,
            reps: set.reps ?? null,
            rir: set.rir ?? null,
            duration_sec: set.sec ?? null,
            distance_m: set.meters ?? null,
            speed_kmh: set.kmh ?? null,
            incline_pct: set.incline ?? null,
            resistance_level: null,
            avg_hr: set.hr ?? null,
            calories: null,
          })),
          records: record && sets[0]?.reps ? [{ kind: 'weight', weight_kg: sets[0].weight, reps: sets[0].reps }] : [],
          cardioRecords: record && !sets[0]?.reps ? [{ kind: 'distance', value: sets[0]?.meters ?? 0 }] : [],
          plan: next === undefined ? null : { next_weight_kg: next },
        }) as unknown as SummaryExercise,
    ),
  }) as unknown as WorkoutRecord;

const chest = workout(12, 'Грудь', '2026-10-02', 58, 6840, [
  { id: 'bench', next: 80, sets: [{ weight: 80, reps: 12 }, { weight: 80, reps: 12 }, { weight: 80, reps: 11, rir: 1 }] },
  { id: 'incline', next: 26, sets: [{ weight: 26, reps: 10 }, { weight: 26, reps: 10 }, { weight: 26, reps: 9 }] },
  { id: 'hammer', superset: 1, next: 14, sets: [{ weight: 14, reps: 12 }, { weight: 14, reps: 12 }] },
  { id: 'pushdown', superset: 1, next: 25, sets: [{ weight: 25, reps: 15 }, { weight: 25, reps: 14 }] },
]);

/** Numbers are grouped with no-break spaces; the spec is written with plain ones. */
const plain = (text: string) => text.replace(/[  ]/g, ' ');

describe('a report', () => {
  it('for a workout reads as the example of the spec', async () => {
    const text = buildReport(await context('ru'), { kind: 'session', workout: chest });

    expect(plain(text)).toBe(
      [
        'Тренировка 12 · Грудь · 02.10.2026',
        'Вес утром: 84,6 кг (среднее за 7 дн. 84,9)',
        '',
        'Жим лёжа 80 кг: 12, 12, 11 (RIR 1) → дальше 80 кг',
        'Жим гантелей на наклонной 26 кг: 10, 10, 9 → дальше 26 кг',
        'Суперсет: молотки 14 кг 12, 12 + разгибания на канате 25 кг 15, 14',
        '',
        'Объём: 6 840 кг · Время: 58 мин',
      ].join('\n'),
    );
  });

  it('writes sets without a weight, with different weights and on time', async () => {
    const back = workout(13, 'Спина', '2026-10-04', 40, 1000, [
      { id: 'pullup', sets: [{ reps: 8 }, { weight: 0, reps: 7 }] },
      { id: 'bench', sets: [{ weight: 80, reps: 8 }, { weight: 75, reps: 8 }] },
      { id: 'plank', sets: [{ sec: 60 }, { sec: 45 }] },
      // An exercise nobody did a set of stays out of the report.
      { id: 'incline', sets: [] },
    ]);
    const lines = plain(buildReport(await context('ru'), { kind: 'session', workout: back })).split('\n');

    expect(lines).toContain('Подтягивания: 8, 7');
    expect(lines).toContain('Жим лёжа: 80 кг × 8, 75 кг × 8');
    expect(lines).toContain('Планка: 1 мин, 45 с');
    expect(lines.join('\n')).not.toContain('наклонной');
  });

  it('for a week and for a round lists the workouts and adds them up', async () => {
    const legs = workout(13, 'Ноги', '2026-10-04', 62, 9160, [
      { id: 'bench', sets: [{ weight: 100, reps: 5 }] },
    ]);
    const ctx = await context('ru');

    const week = plain(buildReport(ctx, { kind: 'week', workouts: [chest, legs], activities: [], today: '2026-10-04' }));
    expect(week.split('\n')[0]).toBe('Неделя 28.09 – 04.10');
    expect(week).toContain('Тренировка 12 · Грудь · 02.10.2026');
    expect(week).toContain('Тренировка 13 · Ноги · 04.10.2026');
    expect(week).toContain('2 тренировки · Объём: 16 000 кг · Время: 120 мин');

    const round = plain(
      buildReport(ctx, { kind: 'cycle', workouts: [chest, legs], cycle: 3, program: 'Масса' }),
    );
    expect(round.split('\n')[0]).toBe('Круг 3 · Масса');
    // The weight of a day belongs to a day: a round does not have one.
    expect(round).not.toContain('Вес');

    expect(
      plain(buildReport(ctx, { kind: 'week', workouts: [], activities: [], today: '2026-10-04' })),
    ).toContain('За эту неделю тренировок и активностей не было.');
  });

  it('writes a cardio set with what was entered on the machine', async () => {
    const run = workout(14, 'Кардио', '2026-10-04', 30, 0, [
      { id: 'treadmill', sets: [{ sec: 25 * 60 + 30, meters: 4200, kmh: 10, incline: 2, hr: 145 }] },
    ]);
    const lines = plain(buildReport(await context('ru'), { kind: 'session', workout: run })).split('\n');
    expect(lines).toContain('Бег на дорожке: 25 мин 30 с, 4,2 км, 10 км/ч, наклон 2 %, пульс 145');
    expect(lines).toContain('Время: 30 мин');
    expect(lines.join('\n')).not.toContain('Объём');
  });

  it('adds the activities of the week after its workouts', async () => {
    const activity = (type: string, date: string, minutes: number, extra: object = {}) =>
      ({
        activity_type: type,
        started_at: new Date(`${date}T18:00:00`).toISOString(),
        duration_sec: minutes * 60,
        intensity: null,
        distance_m: null,
        avg_hr: null,
        calories: null,
        notes: '',
        ...extra,
      }) as unknown as ActivityLogRow;
    const ctx = await context('ru');
    const activities = [
      activity('football', '2026-10-01', 90, { intensity: 7, distance_m: 8200 }),
      activity('Сапборд', '2026-10-03', 45),
    ];

    const week = plain(buildReport(ctx, { kind: 'week', workouts: [chest], activities, today: '2026-10-04' }));
    expect(week).toContain('Активность:');
    expect(week).toContain('01.10 Футбол: 90 мин, 8,2 км, интенсивность 7/10');
    expect(week).toContain('03.10 Сапборд: 45 мин');
    expect(week).toContain('2 активности · 135 мин');
    expect(week.indexOf('Тренировка 12')).toBeLessThan(week.indexOf('Активность:'));

    const only = plain(buildReport(ctx, { kind: 'week', workouts: [], activities, today: '2026-10-04' }));
    expect(only).not.toContain('не было');
  });

  it('marks the exercises that set a personal record, cardio included', async () => {
    const day = workout(15, 'Смешанная', '2026-10-04', 50, 800, [
      { id: 'bench', record: true, sets: [{ weight: 85, reps: 8 }] },
      { id: 'pullup', sets: [{ reps: 8 }] },
      { id: 'treadmill', record: true, sets: [{ sec: 30 * 60, meters: 5100 }] },
    ]);
    const lines = plain(buildReport(await context('ru'), { kind: 'session', workout: day })).split('\n');
    expect(lines).toContain('Жим лёжа 85 кг: 8 🏆 рекорд');
    expect(lines).toContain('Подтягивания: 8');
    expect(lines).toContain('Бег на дорожке: 30 мин, 5,1 км 🏆 рекорд');
  });

  it('is written in English too, with nothing left in Russian but the names', async () => {
    const text = buildReport(await context('en'), { kind: 'session', workout: chest });
    const withoutNames = Object.values(NAMES).reduce(
      (rest, name) => rest.replaceAll(name, ''),
      text.replace('Грудь', ''),
    );

    expect(withoutNames).not.toMatch(/[а-яё]/i);
    expect(text).toContain('84.6 kg');
  });
});
