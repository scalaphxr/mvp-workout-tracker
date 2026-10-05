import type { Exercise } from '@mvp/schemas';
import { describe, expect, it } from 'vitest';

import { cutPace, shiftDate, weightStats } from './body';
import { chooseSplit, generateProgram, sessionSetCap, type Templates } from './generation';
import { matchExercise, parseProgramText, similarity } from './import-text';

describe('weightStats', () => {
  const week = (start: string, weights: (number | null)[]) =>
    weights.flatMap((weight_kg, day) =>
      weight_kg === null ? [] : [{ date: shiftDate(start, day), weight_kg }],
    );

  it('moves dates across months and years', () => {
    expect(shiftDate('2026-10-04', -6)).toBe('2026-09-28');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('averages the last 7 calendar days, today included, as a hand calculation does', () => {
    const entries = week('2026-09-28', [85.2, 85.0, null, 84.8, 84.9, null, 84.6]);
    const stats = weightStats(entries, '2026-10-04');

    expect(stats.today).toBe(84.6);
    expect(stats.average7).toBeCloseTo((85.2 + 85.0 + 84.8 + 84.9 + 84.6) / 5, 10);
    expect(stats.change_kg).toBeNull();
  });

  it('shows no average with fewer than 4 entries in the week', () => {
    const entries = week('2026-09-28', [85.2, null, null, 84.8, null, null, 84.6]);
    expect(weightStats(entries, '2026-10-04')).toMatchObject({ today: 84.6, average7: null });
  });

  it('ignores entries older than 7 days and has no "today" before it is entered', () => {
    const entries = [...week('2026-09-21', [90, 90, 90, 90]), ...week('2026-09-28', [85, 85, 85, 85])];
    const stats = weightStats(entries, '2026-10-04');
    expect(stats.average7).toBe(85);
    expect(stats.today).toBeNull();
  });

  it('compares the week with the one before, in kg and in percent of body weight', () => {
    const entries = [
      ...week('2026-09-21', [86, 86, 86, 86, 86, 86, 86]),
      ...week('2026-09-28', [85.14, 85.14, 85.14, 85.14]),
    ];
    const stats = weightStats(entries, '2026-10-04');
    expect(stats.change_kg).toBeCloseTo(-0.86, 10);
    expect(stats.change_pct).toBeCloseTo(-1, 10);
  });

  it('judges the pace of a cut: 0.5–1% a week is fine, more is too fast', () => {
    expect(cutPace(-0.7)).toBe('ok');
    expect(cutPace(-0.5)).toBe('ok');
    expect(cutPace(-1)).toBe('ok');
    expect(cutPace(-1.2)).toBe('too_fast');
    expect(cutPace(-0.2)).toBe('slow');
    expect(cutPace(0.4)).toBeNull();
    expect(cutPace(null)).toBeNull();
  });
});

// --- Generation ---

let nextId = 0;
function exercise(slug: string, equipment: string[], overrides: Partial<Exercise> = {}): Exercise {
  const text = { name: slug, aliases: [], description: slug, technique_steps: [slug], common_mistakes: [], warnings: [] };
  return {
    id: `00000000-0000-7000-8000-${String(++nextId).padStart(12, '0')}`,
    slug,
    kind: 'strength',
    tracking: 'weight_reps',
    movement_pattern: 'horizontal_pull',
    mechanics: 'compound',
    level: 'beginner',
    is_unilateral: false,
    primary_muscles: ['upper_back'],
    secondary_muscles: [],
    equipment,
    translations: { ru: text, en: text },
    media: [],
    alternatives: [],
    ...overrides,
  };
}

const catalog = [
  exercise('t-bar-row', ['t_bar']),
  exercise('barbell-row', ['barbell']),
  exercise('cable-row', ['cable']),
  exercise('bench-press', ['barbell', 'bench']),
  exercise('push-up', []),
  exercise('squat', ['barbell']),
  exercise('leg-press', ['leg_press']),
  exercise('curl', ['barbell'], { mechanics: 'isolation' }),
  exercise('plank', [], { tracking: 'time', mechanics: 'isolation' }),
];
const templates: Templates = {
  slots: {
    row: { group: 'back', candidates: ['t-bar-row', 'barbell-row', 'cable-row'] },
    row2: { group: 'back', candidates: ['cable-row', 'barbell-row'] },
    bench: { group: 'chest', candidates: ['bench-press', 'push-up'] },
    squat: { group: 'quads', candidates: ['squat', 'leg-press'] },
    curl: { group: 'biceps', candidates: ['curl'] },
    core: { group: 'core', candidates: ['plank'] },
  },
  days: {
    full_body_a: ['squat', 'bench', 'row', 'curl', 'core'],
    full_body_b: ['bench', 'row2', 'squat', 'row', 'core'],
    full_body_c: ['row', 'squat', 'bench'],
  },
};
const gym = new Set(['t_bar', 'barbell', 'cable', 'bench', 'leg_press']);
const answers = { goal: 'mass', level: 'beginner', frequency: 2, duration_min: 60, split: 'auto' } as const;
const slugsOf = (ids: string[]) => ids.map((id) => catalog.find((e) => e.id === id)!.slug);

describe('chooseSplit', () => {
  it('follows the table of frequencies and levels', () => {
    const split = (frequency: 2 | 3 | 4 | 5 | 6 | '2-3', level: 'beginner' | 'intermediate' | 'advanced') =>
      chooseSplit({ frequency, level, split: 'auto' });

    expect(split(2, 'beginner')).toBe('full_body_ab');
    expect(split(2, 'advanced')).toBe('full_body_ab');
    expect(split('2-3', 'intermediate')).toBe('full_body_abc');
    expect(split(3, 'beginner')).toBe('full_body_abc');
    expect(split(3, 'intermediate')).toBe('chest_back_legs');
    expect(split(4, 'beginner')).toBe('upper_lower');
    expect(split(5, 'advanced')).toBe('upper_lower_cbl');
    expect(split(6, 'intermediate')).toBe('push_pull_legs');
  });

  it('lets an experienced lifter keep full body at 3 workouts, but not a beginner leave it', () => {
    expect(chooseSplit({ frequency: 3, level: 'advanced', split: 'full_body' })).toBe('full_body_abc');
    expect(chooseSplit({ frequency: 3, level: 'beginner', split: 'chest_back_legs' })).toBe('full_body_abc');
  });
});

describe('generateProgram', () => {
  it('fits a workout: its length less a 10-minute warm-up, 3 minutes a set', () => {
    expect([30, 45, 60, 75, 90].map(sessionSetCap)).toEqual([6, 11, 16, 21, 26]);
  });

  it('builds the days of the split from the first exercise the gym has equipment for', () => {
    // A long workout, so that nothing has to be cut.
    const draft = generateProgram({ ...answers, duration_min: 90 }, templates, catalog, gym);

    expect(draft).toMatchObject({ split: 'full_body_ab', days_per_week: 2, set_cap: 26 });
    expect(draft.days.map((day) => day.key)).toEqual(['full_body_a', 'full_body_b']);
    expect(slugsOf(draft.days[0]!.items.map((item) => item.exercise_id))).toEqual([
      'squat',
      'bench-press',
      't-bar-row',
      'curl',
      'plank',
    ]);
  });

  it('replaces the T-bar row with a row of the same slot in a gym without a T-bar', () => {
    const noTBar = new Set([...gym].filter((code) => code !== 't_bar'));
    const draft = generateProgram(answers, templates, catalog, noTBar);
    const used = draft.days.flatMap((day) => slugsOf(day.items.map((item) => item.exercise_id)));

    expect(used).not.toContain('t-bar-row');
    expect(slugsOf([draft.days[0]!.items[2]!.exercise_id])).toEqual(['barbell-row']);
  });

  it('does not put one exercise into a day twice, and leaves out a slot nothing can fill', () => {
    const draft = generateProgram(answers, templates, catalog, new Set(['cable']));
    const dayB = slugsOf(draft.days[1]!.items.map((item) => item.exercise_id));

    // Both row slots want the cable row; only one gets it. No barbell: no squat, no curl.
    expect(dayB).toEqual(['push-up', 'cable-row', 'plank']);
  });

  it('gives the rep ranges, rest and RIR of the goal', () => {
    const strength = generateProgram(
      { ...answers, goal: 'strength', duration_min: 90 },
      templates,
      catalog,
      gym,
    );
    expect(strength.days[0]!.items[0]).toMatchObject({ rep_min: 4, rep_max: 6, rest_sec: 180 });
    const curl = strength.days[0]!.items.find((item) => item.group === 'biceps')!;
    expect(curl).toMatchObject({ rep_min: 8, rep_max: 12, rest_sec: 90 });
  });

  it('aims the sets at the weekly volume of the level', () => {
    const beginner = generateProgram(answers, templates, catalog, gym);
    const advanced = generateProgram({ ...answers, level: 'advanced', duration_min: 90 }, templates, catalog, gym);

    // The back has 3 slots a week: 9 sets for a beginner is 3 a slot, 16 for advanced is 5.
    expect(beginner.days[0]!.items.find((item) => item.group === 'back')!.sets).toBe(3);
    expect(advanced.days[0]!.items.find((item) => item.group === 'back')!.sets).toBe(5);
    expect(beginner.weekly_sets.back).toBe(9);
    expect(advanced.weekly_sets.back).toBe(15);
  });

  it('cuts a day down to what fits a short workout, least important exercises first', () => {
    const short = generateProgram({ ...answers, duration_min: 30 }, templates, catalog, gym);

    for (const day of short.days) {
      expect(day.items.reduce((sum, item) => sum + item.sets, 0)).toBeLessThanOrEqual(6);
      expect(day.items.length).toBeGreaterThanOrEqual(2);
    }
    expect(slugsOf(short.days[0]!.items.map((item) => item.exercise_id))).toEqual(['squat', 'bench-press']);
  });

  it('treats a varying 2–3 workouts as a three-day round', () => {
    const floating = generateProgram({ ...answers, frequency: '2-3' }, templates, catalog, gym);
    expect(floating).toMatchObject({ split: 'full_body_abc', days_per_week: 3 });
    expect(floating.days).toHaveLength(3);
  });
});

// --- Import from text ---

describe('parseProgramText', () => {
  const items = (text: string) => parseProgramText(text).days.flatMap((day) => day.items);

  it.each([
    ['Жим лёжа 3×8-10, отдых 2 мин', 'Жим лёжа', 3, 8, 10, 120],
    ['Жим лёжа 3х8–10', 'Жим лёжа', 3, 8, 10, null],
    ['Bench press 3x8-10 (rest 90 sec)', 'Bench press', 3, 8, 10, 90],
    ['1. Приседания со штангой 4 x 6', 'Приседания со штангой', 4, 6, 6, null],
    ['- Тяга верхнего блока — 3 подхода по 10-12', 'Тяга верхнего блока', 3, 10, 12, null],
    ['Squat: 5 sets of 5', 'Squat', 5, 5, 5, null],
    ['Подтягивания 8-10 повторений, 4 подхода', 'Подтягивания', 4, 8, 10, null],
    ['3x12 Молотки', 'Молотки', 3, 12, 12, null],
    ['Жим в хаммере 3х10, отдых 1,5 мин', 'Жим в хаммере', 3, 10, 10, 90],
    ['Жим лёжа\t3\t8-9\t120', 'Жим лёжа', 3, 8, 9, 120],
  ])('reads "%s"', (line, name, sets, rep_min, rep_max, rest_sec) => {
    expect(items(line)).toEqual([{ name, sets, rep_min, rep_max, unit: 'reps', rest_sec, superset: false }]);
  });

  it('keeps a range like 8-9 a range, as two numbers', () => {
    const [item] = items('Жим гантелей 3×8-9');
    expect([item!.rep_min, item!.rep_max]).toEqual([8, 9]);
  });

  it('reads holds in seconds and in minutes', () => {
    expect(items('Планка 3×60 сек')[0]).toMatchObject({ rep_min: 60, rep_max: 60, unit: 'sec' });
    expect(items('Plank 3x1 min')[0]).toMatchObject({ rep_min: 60, rep_max: 60, unit: 'sec' });
    expect(items('Планка 3х30-45с')[0]).toMatchObject({ rep_min: 30, rep_max: 45, unit: 'sec' });
  });

  it('splits the text into days by their headings', () => {
    const program = parseProgramText(`
      День 1 — Грудь
      Жим лёжа 3×8-10
      Жим гантелей на наклонной 3×10-12

      День 2: Спина
      Тяга штанги в наклоне 4х8
    `);

    expect(program.days.map((day) => [day.title, day.items.map((item) => item.name)])).toEqual([
      ['День 1 — Грудь', ['Жим лёжа', 'Жим гантелей на наклонной']],
      ['День 2: Спина', ['Тяга штанги в наклоне']],
    ]);
    expect(program.skipped).toEqual([]);
  });

  it('puts exercises without a heading into one unnamed day', () => {
    const program = parseProgramText('Жим лёжа 3x10\nПрисед 3x10');
    expect(program.days).toEqual([expect.objectContaining({ title: null })]);
    expect(program.days[0]!.items).toHaveLength(2);
  });

  it('reads a superset written on one line', () => {
    expect(items('Суперсет: молотки 3×12 + разгибания на канате 3×15')).toMatchObject([
      { name: 'молотки', sets: 3, rep_min: 12, superset: false },
      { name: 'разгибания на канате', sets: 3, rep_min: 15, superset: true },
    ]);
  });

  it('reads exercises joined with a plus as a superset without the word too', () => {
    expect(items('Молотки 3х12 + Разгибания на канате 3х15')).toMatchObject([
      { name: 'Молотки', superset: false },
      { name: 'Разгибания на канате', superset: true },
    ]);
    // A plus that does not join two exercises leaves the line one exercise.
    expect(items('Жим лёжа 3x10 + дроп-сет в конце')).toMatchObject([
      { name: 'Жим лёжа', sets: 3, rep_min: 10, superset: false },
    ]);
  });

  it('does not take a remark between two exercises for the heading of a day', () => {
    const program = parseProgramText(`
      Жим лёжа 3x10
      Не забыть полотенце
      Присед 3x10
      Тренировка B
      Становая тяга 3x5
      Растяжка:
      Планка 3x60 сек
    `);

    expect(program.days.map((day) => [day.title, day.items.length])).toEqual([
      [null, 2],
      ['Тренировка B', 1],
      ['Растяжка', 1],
    ]);
    expect(program.skipped).toEqual(['Не забыть полотенце']);
  });

  it('sets aside long lines of prose and keeps going', () => {
    const program = parseProgramText(`
      Привет! Вот программа на массу, которую мы обсуждали вчера вечером, начинай с понедельника и не пропускай.
      Жим лёжа 3x10
    `);
    expect(program.skipped).toHaveLength(1);
    expect(program.days[0]!.items).toHaveLength(1);
  });

  it('refuses numbers that cannot be sets and reps', () => {
    expect(items('Жим лёжа 0x10')).toEqual([]);
    expect(items('Жим лёжа 3x12-8')).toEqual([]);
    expect(items('3x10')).toEqual([]);
    expect(parseProgramText('')).toEqual({ days: [], skipped: [] });
  });
});

describe('matchExercise', () => {
  const named = (slug: string, ru: string, en: string, aliases: string[] = []) => {
    const base = exercise(slug, []);
    return {
      ...base,
      translations: {
        ru: { ...base.translations.ru, name: ru, aliases },
        en: { ...base.translations.en, name: en },
      },
    };
  };
  const known = [
    named('bench', 'Жим штанги лёжа', 'Barbell bench press', ['жим лёжа']),
    named('squat', 'Приседания со штангой на спине', 'Barbell back squat', ['присед']),
    named('curl', 'Подъём штанги на бицепс', 'Barbell curl'),
  ];
  const match = (name: string) => matchExercise(name, known)?.slug ?? null;

  it('finds an exercise by its exact name in either language, whatever the case and «ё»', () => {
    expect(match('жим штанги лежа')).toBe('bench');
    expect(match('BARBELL BENCH PRESS')).toBe('bench');
  });

  it('finds an exercise by an alias', () => {
    expect(match('Жим лёжа')).toBe('bench');
    expect(match('присед')).toBe('squat');
  });

  it('finds a misspelt or shortened name when it is close enough', () => {
    expect(match('Жим штанги лежа на скамье')).toBe('bench');
    expect(match('подъем штанги на бицепс стоя')).toBe('curl');
    expect(match('barbel curl')).toBe('curl');
  });

  it('leaves an unfamiliar name to the user', () => {
    expect(match('Прыжки на скакалке')).toBeNull();
    expect(match('Тяга')).toBeNull();
  });

  it('measures likeness from 0 to 1', () => {
    expect(similarity('жим лёжа', 'Жим лежа')).toBe(1);
    expect(similarity('жим', 'присед')).toBe(0);
  });
});
