import { createInstance, type TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

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
  sets: { weight?: number | null; reps?: number; rir?: number; sec?: number }[];
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
      ({ id, sets, next, superset }) =>
        ({
          exercise: { exercise_id: id },
          item: { program_day_id: day, superset_group: superset ?? null },
          sets: sets.map((set) => ({
            weight_kg: set.weight ?? null,
            reps: set.reps ?? null,
            rir: set.rir ?? null,
            duration_sec: set.sec ?? null,
          })),
          records: [],
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

    const week = plain(buildReport(ctx, { kind: 'week', workouts: [chest, legs], today: '2026-10-04' }));
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

    expect(plain(buildReport(ctx, { kind: 'week', workouts: [], today: '2026-10-04' }))).toContain(
      'За это время тренировок не было.',
    );
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
