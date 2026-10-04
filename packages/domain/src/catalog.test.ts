import type { CatalogSeed, Exercise } from '@mvp/schemas';
import { describe, expect, it } from 'vitest';

import { findCatalogProblems, normalizeText, pickMedia, searchExercises } from './catalog';

let nextId = 0;
const id = () => `00000000-0000-7000-8000-${String(++nextId).padStart(12, '0')}`;

function exercise(slug: string, ru: string, en: string, overrides: Partial<Exercise> = {}): Exercise {
  const text = (name: string) => ({
    name,
    aliases: [],
    description: name,
    technique_steps: [name],
    common_mistakes: [],
    warnings: [],
  });
  return {
    id: id(),
    slug,
    kind: 'strength',
    tracking: 'weight_reps',
    movement_pattern: 'horizontal_push',
    mechanics: 'compound',
    level: 'beginner',
    is_unilateral: false,
    primary_muscles: ['chest'],
    secondary_muscles: [],
    equipment: ['barbell'],
    translations: { ru: text(ru), en: text(en) },
    media: [],
    alternatives: [],
    ...overrides,
  };
}

const bench = exercise('barbell-bench-press', 'Жим штанги лёжа', 'Barbell bench press');
bench.translations.ru.aliases = ['жим лёжа'];
bench.translations.en.aliases = ['bench'];
const dumbbellBench = exercise('dumbbell-bench-press', 'Жим гантелей лёжа', 'Dumbbell bench press', {
  equipment: ['dumbbells', 'flat_bench'],
});
const squat = exercise('barbell-back-squat', 'Приседания со штангой', 'Barbell back squat', {
  primary_muscles: ['quads', 'glutes'],
  secondary_muscles: ['hamstrings'],
  level: 'intermediate',
});
const pullUp = exercise('pull-up', 'Подтягивания', 'Pull-up', {
  primary_muscles: ['lats'],
  equipment: ['pull_up_bar'],
  level: 'intermediate',
});
const pushUp = exercise('push-up', 'Отжимания от пола', 'Push-up', { equipment: [] });
const all = [bench, dumbbellBench, squat, pullUp, pushUp];

const slugs = (exercises: Exercise[]) => exercises.map((e) => e.slug);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('normalizeText', () => {
  it('ignores case, «ё» and punctuation', () => {
    expect(normalizeText('  Жим ЛЁЖА, 3×8-10 ')).toBe('жим лежа 3 8 10');
    expect(normalizeText('Pull-up')).toBe('pull up');
  });
});

describe('searchExercises', () => {
  it('returns everything alphabetically in the user language when there are no filters', () => {
    expect(slugs(searchExercises(all, {}, 'ru'))).toEqual([
      'dumbbell-bench-press', // Жим гантелей лёжа
      'barbell-bench-press', // Жим штанги лёжа
      'push-up', // Отжимания от пола
      'pull-up', // Подтягивания
      'barbell-back-squat', // Приседания со штангой
    ]);
    expect(slugs(searchExercises(all, {}, 'en'))[0]).toBe('barbell-back-squat');
  });

  it('matches word prefixes in any order, ignoring case and «ё»', () => {
    expect(slugs(searchExercises(all, { query: 'лежа ЖИМ' }, 'ru'))).toEqual([
      'dumbbell-bench-press',
      'barbell-bench-press',
    ]);
    expect(slugs(searchExercises(all, { query: 'жим шт' }, 'ru'))).toEqual(['barbell-bench-press']);
  });

  it('does not match the middle of a word', () => {
    expect(searchExercises(all, { query: 'танг' }, 'ru')).toEqual([]);
  });

  it('finds an exercise by its name in the other language and by an alias', () => {
    expect(slugs(searchExercises(all, { query: 'squat' }, 'ru'))).toEqual(['barbell-back-squat']);
    expect(slugs(searchExercises(all, { query: 'pull up' }, 'ru'))).toEqual(['pull-up']);
  });

  it('puts name matches above alias matches', () => {
    const curl = exercise('barbell-curl', 'Подъём штанги на бицепс', 'Barbell curl');
    curl.translations.en.aliases = ['bench curl'];
    // "bench" is in the name of two exercises and only in an alias of the curl.
    expect(slugs(searchExercises([curl, ...all], { query: 'bench' }, 'en'))).toEqual([
      'barbell-bench-press',
      'dumbbell-bench-press',
      'barbell-curl',
    ]);
  });

  it('filters by primary muscle, not by secondary', () => {
    expect(slugs(searchExercises(all, { muscles: ['quads', 'lats'] }, 'en'))).toEqual([
      'barbell-back-squat',
      'pull-up',
    ]);
    expect(searchExercises(all, { muscles: ['hamstrings'] }, 'en')).toEqual([]);
  });

  it('filters by equipment: any of the selected', () => {
    expect(slugs(searchExercises(all, { equipment: ['dumbbells', 'pull_up_bar'] }, 'en'))).toEqual([
      'dumbbell-bench-press',
      'pull-up',
    ]);
  });

  it('filters by level and combines filters with the query', () => {
    expect(slugs(searchExercises(all, { level: 'intermediate' }, 'en'))).toEqual([
      'barbell-back-squat',
      'pull-up',
    ]);
    expect(
      slugs(searchExercises(all, { query: 'bar', level: 'beginner', muscles: ['chest'] }, 'en')),
    ).toEqual(['barbell-bench-press']);
  });

  it('treats an empty or whitespace query as no query', () => {
    expect(searchExercises(all, { query: '   ' }, 'en')).toHaveLength(all.length);
  });
});

describe('pickMedia', () => {
  const video = (lang: 'ru' | 'en', videoId: string) =>
    ({ provider: 'youtube', video_id: videoId, start_sec: 0, lang }) as const;

  it('prefers the video in the user language and falls back to the other one', () => {
    const both = { ...bench, media: [video('en', 'aaaaaaaaaaa'), video('ru', 'bbbbbbbbbbb')] };
    expect(pickMedia(both, 'ru')?.video_id).toBe('bbbbbbbbbbb');
    expect(pickMedia({ ...bench, media: [video('en', 'aaaaaaaaaaa')] }, 'ru')?.lang).toBe('en');
    expect(pickMedia(bench, 'ru')).toBeNull();
  });
});

describe('findCatalogProblems', () => {
  const seed = (): CatalogSeed => ({
    equipment: [
      {
        id: id(),
        code: 'barbell',
        category: 'barbells',
        name: { ru: 'Штанга', en: 'Barbell' },
        default_increment_kg: 2.5,
        default_increment_lb: 5,
      },
    ],
    muscles: [
      {
        id: id(),
        code: 'chest',
        name: { ru: 'Грудь', en: 'Chest' },
        svg_region: 'chest',
        svg_side: 'front',
      },
    ],
    exercises: [clone(bench)],
  });

  it('accepts a consistent seed', () => {
    expect(findCatalogProblems(seed())).toEqual([]);
  });

  it('reports references to unknown muscles, equipment and alternatives', () => {
    const broken = seed();
    const [first] = broken.exercises;
    first!.secondary_muscles = ['wings'];
    first!.equipment = ['barbell', 'anvil'];
    first!.alternatives = [{ slug: 'no-such-exercise', weight_ratio: null, priority: 1 }];

    expect(findCatalogProblems(broken)).toEqual([
      'barbell-bench-press: unknown muscle wings',
      'barbell-bench-press: unknown equipment anvil',
      'barbell-bench-press: unknown alternative no-such-exercise',
    ]);
  });

  it('reports duplicate ids, slugs and an exercise listed as its own alternative', () => {
    const broken = seed();
    const copy = clone(broken.exercises[0]!);
    copy.alternatives = [{ slug: copy.slug, weight_ratio: null, priority: 1 }];
    broken.exercises.push(copy);

    const problems = findCatalogProblems(broken);
    expect(problems).toContain(`Duplicate id: ${copy.id}`);
    expect(problems).toContain('Duplicate exercise slug: barbell-bench-press');
    expect(problems).toContain('barbell-bench-press: lists itself as an alternative');
  });

  it('reports a muscle that is both primary and secondary', () => {
    const broken = seed();
    broken.exercises[0]!.secondary_muscles = ['chest'];
    expect(findCatalogProblems(broken)).toEqual([
      'barbell-bench-press: muscle chest is both primary and secondary',
    ]);
  });

  it('reports a name or alias shared by two exercises: import could not tell them apart', () => {
    const broken = seed();
    const other = exercise('other-press', 'Другой жим', 'Other press');
    other.translations.ru.aliases = ['Жим  лежа!'];
    broken.exercises.push(other);

    expect(findCatalogProblems(broken)).toEqual([
      '"жим лежа" (ru) names both barbell-bench-press and other-press',
    ]);
  });
});
