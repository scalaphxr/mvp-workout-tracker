import { gym_equipment, program_days, program_items, programs } from '@mvp/db/sqlite';
import { createTestDb } from '@mvp/db/sqlite/testing';
import { type ItemParams, uuidv7 } from '@mvp/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import type { DataContext } from './context';
import {
  createGymProfile,
  defaultGym,
  deleteGymProfile,
  getGymEquipment,
  gymChanges,
  listGymProfiles,
  setDefaultGym,
  setGymEquipment,
  updateGymProfile,
} from './gym';
import {
  addDay,
  addItem,
  createProgram,
  deleteDay,
  deleteItem,
  deleteProgram,
  getProgramTree,
  importTree,
  listPrograms,
  moveDay,
  moveItem,
  programChanges,
  renameDay,
  replaceExercise,
  setSuperset,
  updateItem,
  updateProgram,
} from './programs';

let ctx: DataContext;
let clock: number;

const id = (n: number) => uuidv7(n, new Uint8Array(10));
const BARBELL = id(1);
const DUMBBELLS = id(2);
const BENCH = id(3);
const [SQUAT, CURL, PUSHDOWN, PLANK] = [id(11), id(12), id(13), id(14)];

const PARAMS: ItemParams = { sets: 3, rep_min: 8, rep_max: 10, rest_sec: 120, target_rir: 1 };

beforeEach(async () => {
  clock = Date.UTC(2026, 9, 4, 10);
  let ids = 1000;
  ctx = {
    db: await createTestDb(),
    // Every reading of the clock is a second later, so "what changed" is visible in updated_at.
    now: () => new Date((clock += 1000)).toISOString(),
    newId: () => id(++ids),
  };
});

/** A program with one day and the given exercises in it. */
function programWith(...exerciseIds: string[]) {
  const program = createProgram(ctx, { title: 'Arms', firstDayTitle: 'Day 1' });
  const [day] = getProgramTree(ctx, program.id)!.days;
  const items = exerciseIds.map((exerciseId) => addItem(ctx, day!.id, exerciseId, PARAMS));
  return { program, day: day!, items };
}

const itemsOf = (programId: string) => getProgramTree(ctx, programId)!.items;
const order = (programId: string) => itemsOf(programId).map((item) => item.exercise_id);
const supersets = (programId: string) => itemsOf(programId).map((item) => item.superset_group);

describe('gym profiles', () => {
  const full = new Map<string, number | null>([
    [BARBELL, 2.5],
    [DUMBBELLS, 2],
    [BENCH, null],
  ]);

  it('makes the first profile the default one and stores its equipment with steps', () => {
    const gym = createGymProfile(ctx, { name: 'My gym', location_type: 'gym', equipment: full });
    const home = createGymProfile(ctx, { name: 'Home', location_type: 'home', equipment: new Map() });

    expect(gym.is_default).toBe(true);
    expect(home.is_default).toBe(false);
    expect(defaultGym(ctx)!.id).toBe(gym.id);
    expect(listGymProfiles(ctx).map((profile) => profile.name)).toEqual(['My gym', 'Home']);
    expect(
      getGymEquipment(ctx, gym.id).map((row) => [row.equipment_id, row.increment_kg]),
    ).toEqual([...full]);
  });

  it('changes only the rows that differ when equipment is saved', () => {
    const gym = createGymProfile(ctx, { name: 'My gym', location_type: 'gym', equipment: full });
    const before = new Map(getGymEquipment(ctx, gym.id).map((row) => [row.equipment_id, row]));

    setGymEquipment(ctx, gym.id, new Map([[BARBELL, 2.5], [DUMBBELLS, 1]]));

    const after = new Map(getGymEquipment(ctx, gym.id).map((row) => [row.equipment_id, row]));
    expect([...after.keys()]).toEqual([BARBELL, DUMBBELLS]);
    expect(after.get(BARBELL)).toEqual(before.get(BARBELL));
    expect(after.get(DUMBBELLS)).toMatchObject({ increment_kg: 1 });
    expect(after.get(DUMBBELLS)!.updated_at > before.get(DUMBBELLS)!.updated_at).toBe(true);
  });

  it('revives the same row when a box is ticked again, so sync sees one row per equipment', () => {
    const gym = createGymProfile(ctx, { name: 'My gym', location_type: 'gym', equipment: full });
    const original = getGymEquipment(ctx, gym.id).find((row) => row.equipment_id === BENCH)!;

    setGymEquipment(ctx, gym.id, new Map([[BARBELL, 2.5]]));
    setGymEquipment(ctx, gym.id, new Map([[BARBELL, 2.5], [BENCH, null]]));

    const revived = getGymEquipment(ctx, gym.id).find((row) => row.equipment_id === BENCH)!;
    expect(revived.id).toBe(original.id);
    expect(ctx.db.select().from(gym_equipment).all()).toHaveLength(3);
  });

  it('renames a profile and moves the default flag', () => {
    const gym = createGymProfile(ctx, { name: 'My gym', location_type: 'gym', equipment: full });
    const home = createGymProfile(ctx, { name: 'Home', location_type: 'home', equipment: new Map() });

    updateGymProfile(ctx, home.id, { name: 'Garage', location_type: 'home_no_equipment' });
    setDefaultGym(ctx, home.id);

    expect(listGymProfiles(ctx).map((p) => [p.name, p.location_type, p.is_default])).toEqual([
      ['Garage', 'home_no_equipment', true],
      ['My gym', 'gym', false],
    ]);
    expect(defaultGym(ctx)!.id).toBe(home.id);
    expect(gym.id).not.toBe(home.id);
  });

  it('refuses an empty name', () => {
    const gym = createGymProfile(ctx, { name: 'My gym', location_type: 'gym', equipment: full });
    expect(() => updateGymProfile(ctx, gym.id, { name: '   ' })).toThrow();
    expect(defaultGym(ctx)!.name).toBe('My gym');
  });

  it('deletes a profile softly, hands the default flag over, and keeps the last profile', () => {
    const gym = createGymProfile(ctx, { name: 'My gym', location_type: 'gym', equipment: full });
    const home = createGymProfile(ctx, { name: 'Home', location_type: 'home', equipment: new Map() });

    expect(deleteGymProfile(ctx, gym.id)).toBe(true);
    expect(listGymProfiles(ctx).map((p) => [p.name, p.is_default])).toEqual([['Home', true]]);
    expect(getGymEquipment(ctx, gym.id)).toEqual([]);

    expect(deleteGymProfile(ctx, home.id)).toBe(false);
    expect(listGymProfiles(ctx)).toHaveLength(1);
  });

  it('gives sync the profile and all its equipment rows, removed ones included', () => {
    const gym = createGymProfile(ctx, { name: 'My gym', location_type: 'gym', equipment: full });
    setGymEquipment(ctx, gym.id, new Map([[BARBELL, 2.5]]));

    const changes = gymChanges(ctx, gym.id);
    expect(changes.map((change) => change.table)).toEqual([
      'gym_profiles',
      'gym_equipment',
      'gym_equipment',
      'gym_equipment',
    ]);
    const removed = changes.filter(
      (change) => change.op === 'upsert' && change.row.deleted_at !== null,
    );
    expect(removed).toHaveLength(2);
  });
});

describe('programs', () => {
  it('creates a private program with a first empty day', () => {
    const { program } = programWith();
    const tree = getProgramTree(ctx, program.id)!;

    expect(tree.program).toMatchObject({ title: 'Arms', visibility: 'private', forked_from_id: null });
    expect(tree.days.map((day) => [day.title, day.kind, day.position])).toEqual([
      ['Day 1', 'regular', 0],
    ]);
    expect(tree.items).toEqual([]);
    expect(listPrograms(ctx).map((row) => row.id)).toEqual([program.id]);
  });

  it('lists programs newest first', () => {
    createProgram(ctx, { title: 'Older', firstDayTitle: 'Day 1' });
    createProgram(ctx, { title: 'Newer', firstDayTitle: 'Day 1' });
    expect(listPrograms(ctx).map((program) => program.title)).toEqual(['Newer', 'Older']);
  });

  it('renames a program and refuses an empty title', () => {
    const { program } = programWith();
    updateProgram(ctx, program.id, { title: 'Arms and shoulders', goal: 'mass' });
    expect(getProgramTree(ctx, program.id)!.program).toMatchObject({
      title: 'Arms and shoulders',
      goal: 'mass',
    });
    expect(() => updateProgram(ctx, program.id, { title: ' ' })).toThrow();
  });

  it('deletes a program softly together with its days and items', () => {
    const { program } = programWith(SQUAT, CURL);
    deleteProgram(ctx, program.id);

    expect(getProgramTree(ctx, program.id)).toBeNull();
    expect(listPrograms(ctx)).toEqual([]);
    // The rows stay, marked as deleted, so that the deletion syncs.
    for (const table of [programs, program_days, program_items]) {
      const rows = ctx.db.select().from(table).all();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.deleted_at !== null)).toBe(true);
    }
  });
});

describe('days', () => {
  it('adds days at the end and moves them up and down', () => {
    const { program, day } = programWith();
    const second = addDay(ctx, program.id, 'Day 2', 'regular');
    const third = addDay(ctx, program.id, 'Day 3', 'regular');
    const titles = () => getProgramTree(ctx, program.id)!.days.map((d) => d.title);

    moveDay(ctx, third.id, -1);
    expect(titles()).toEqual(['Day 1', 'Day 3', 'Day 2']);
    moveDay(ctx, day.id, 1);
    expect(titles()).toEqual(['Day 3', 'Day 1', 'Day 2']);

    // The edges do not wrap around.
    moveDay(ctx, third.id, -1);
    moveDay(ctx, second.id, 1);
    expect(titles()).toEqual(['Day 3', 'Day 1', 'Day 2']);
    expect(getProgramTree(ctx, program.id)!.days.map((d) => d.position)).toEqual([0, 1, 2]);
  });

  it('keeps a single "every workout" block per program', () => {
    const { program } = programWith();
    const block = addDay(ctx, program.id, 'Every workout', 'every_session');
    const again = addDay(ctx, program.id, 'Abs', 'every_session');

    expect(again.id).toBe(block.id);
    expect(getProgramTree(ctx, program.id)!.days.map((d) => d.kind)).toEqual([
      'regular',
      'every_session',
    ]);
  });

  it('renames a day', () => {
    const { program, day } = programWith();
    renameDay(ctx, day.id, 'Chest');
    expect(getProgramTree(ctx, program.id)!.days[0]!.title).toBe('Chest');
  });

  it('deletes a day with its items and closes the gap in positions', () => {
    const { program, day } = programWith(SQUAT);
    addDay(ctx, program.id, 'Day 2', 'regular');
    deleteDay(ctx, day.id);

    const tree = getProgramTree(ctx, program.id)!;
    expect(tree.days.map((d) => [d.title, d.position])).toEqual([['Day 2', 0]]);
    expect(tree.items).toEqual([]);
  });
});

describe('items', () => {
  it('stores a range of reps as two numbers, exactly as entered', () => {
    const { program, day } = programWith();
    addItem(ctx, day.id, SQUAT, { ...PARAMS, rep_min: 8, rep_max: 9 });

    const [item] = itemsOf(program.id);
    expect([item!.rep_min, item!.rep_max]).toEqual([8, 9]);
    const [raw] = ctx.db.select().from(program_items).all();
    expect(typeof raw!.rep_min).toBe('number');
    expect(typeof raw!.rep_max).toBe('number');
  });

  it('changes the numbers of an item', () => {
    const { program, items } = programWith(SQUAT);
    updateItem(ctx, items[0]!.id, {
      sets: 4,
      rep_min: 10,
      rep_max: 12,
      rest_sec: 90,
      target_rir: null,
      increment_kg: 1.25,
      notes: 'slow',
    });

    expect(itemsOf(program.id)[0]).toMatchObject({
      sets: 4,
      rep_min: 10,
      rep_max: 12,
      rest_sec: 90,
      target_rir: null,
      increment_kg: 1.25,
      notes: 'slow',
    });
  });

  it.each([
    ['a range with min above max', { rep_min: 12, rep_max: 8 }],
    ['zero sets', { sets: 0 }],
    ['zero reps', { rep_min: 0 }],
    ['negative rest', { rest_sec: -15 }],
    ['a fractional number of reps', { rep_max: 9.5 }],
  ])('refuses %s and leaves the item as it was', (_name, patch) => {
    const { program, items } = programWith(SQUAT);
    expect(() => updateItem(ctx, items[0]!.id, patch)).toThrow();
    expect(itemsOf(program.id)[0]).toMatchObject(PARAMS);
  });

  it('moves an item up and down within its day', () => {
    const { program, items } = programWith(SQUAT, CURL, PUSHDOWN);

    moveItem(ctx, items[2]!.id, -1);
    expect(order(program.id)).toEqual([SQUAT, PUSHDOWN, CURL]);
    moveItem(ctx, items[0]!.id, 1);
    expect(order(program.id)).toEqual([PUSHDOWN, SQUAT, CURL]);
    moveItem(ctx, items[2]!.id, -1); // PUSHDOWN is already first
    moveItem(ctx, items[1]!.id, 1); // CURL is already last
    expect(order(program.id)).toEqual([PUSHDOWN, SQUAT, CURL]);
    expect(itemsOf(program.id).map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it('deletes an item and closes the gap in positions', () => {
    const { program, items } = programWith(SQUAT, CURL, PUSHDOWN);
    deleteItem(ctx, items[0]!.id);

    expect(order(program.id)).toEqual([CURL, PUSHDOWN]);
    expect(itemsOf(program.id).map((item) => item.position)).toEqual([0, 1]);
  });

  it('replaces the exercise of an item and resets its weight step', () => {
    const { program, items } = programWith(CURL);
    updateItem(ctx, items[0]!.id, { increment_kg: 1.25 });
    replaceExercise(ctx, items[0]!.id, PUSHDOWN);

    expect(itemsOf(program.id)[0]).toMatchObject({
      id: items[0]!.id,
      exercise_id: PUSHDOWN,
      increment_kg: null,
      rep_min: 8,
    });
  });
});

describe('supersets', () => {
  it('joins an item with the next one and takes it back out', () => {
    const { program, items } = programWith(SQUAT, CURL, PUSHDOWN);

    setSuperset(ctx, items[1]!.id, 'link-next');
    expect(supersets(program.id)).toEqual([null, 1, 1]);

    setSuperset(ctx, items[1]!.id, 'unlink');
    expect(supersets(program.id)).toEqual([null, null, null]);
  });

  it('grows a superset to three and keeps two supersets of a day apart', () => {
    const { program, items } = programWith(SQUAT, CURL, PUSHDOWN, PLANK);

    setSuperset(ctx, items[0]!.id, 'link-next');
    setSuperset(ctx, items[2]!.id, 'link-next');
    expect(supersets(program.id)).toEqual([1, 1, 2, 2]);

    setSuperset(ctx, items[1]!.id, 'link-next');
    expect(supersets(program.id)).toEqual([1, 1, 1, 1]);
  });

  it('dissolves a superset of two when one of its items is deleted', () => {
    const { program, items } = programWith(SQUAT, CURL, PUSHDOWN);
    setSuperset(ctx, items[1]!.id, 'link-next');

    deleteItem(ctx, items[2]!.id);
    expect(supersets(program.id)).toEqual([null, null]);
  });

  it('takes an item out of its superset when it is moved away', () => {
    const { program, items } = programWith(SQUAT, CURL, PUSHDOWN);
    setSuperset(ctx, items[0]!.id, 'link-next'); // SQUAT + CURL

    moveItem(ctx, items[1]!.id, 1); // CURL below PUSHDOWN
    expect(order(program.id)).toEqual([SQUAT, PUSHDOWN, CURL]);
    expect(supersets(program.id)).toEqual([null, null, null]);
  });

  it('keeps a superset whole when its items swap places', () => {
    const { program, items } = programWith(SQUAT, CURL, PUSHDOWN);
    setSuperset(ctx, items[0]!.id, 'link-next');

    moveItem(ctx, items[0]!.id, 1);
    expect(order(program.id)).toEqual([CURL, SQUAT, PUSHDOWN]);
    expect(supersets(program.id)).toEqual([1, 1, null]);
  });
});

describe('exchange with the server', () => {
  it('gives sync the whole program, parents first, deleted rows included', () => {
    const { program, items } = programWith(SQUAT, CURL);
    deleteItem(ctx, items[0]!.id);

    const changes = programChanges(ctx, program.id);
    expect(changes.map((change) => change.table)).toEqual([
      'programs',
      'program_days',
      'program_items',
      'program_items',
    ]);
    expect(changes.filter((c) => c.op === 'upsert' && c.row.deleted_at !== null)).toHaveLength(1);
  });

  it('saves a program received from the server as it is', async () => {
    const { program } = programWith(SQUAT, CURL);
    const tree = getProgramTree(ctx, program.id)!;

    const other: DataContext = { ...ctx, db: await createTestDb() };
    importTree(other, tree);

    expect(getProgramTree(other, program.id)).toEqual(tree);
  });
});
