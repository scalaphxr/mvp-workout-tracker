import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { bundleMigrations } from '../../scripts/bundle-sqlite-migrations';
import { gym_equipment, gym_profiles, program_days, program_items, programs } from './schema';
import { createTestDb } from './testing';

const stamps = {
  created_at: '2026-10-04T10:00:00.000Z',
  updated_at: '2026-10-04T10:00:00.000Z',
  deleted_at: null,
};

describe('phone database', () => {
  it('ships the migrations that drizzle-kit generated (run `pnpm db:generate` after a schema change)', () => {
    const bundled = fileURLToPath(new URL('./migrations.generated.ts', import.meta.url));
    expect(readFileSync(bundled, 'utf8').replace(/\r\n/g, '\n')).toBe(bundleMigrations());
  });

  it('creates every table of the schema, and each stores a full row', async () => {
    const db = await createTestDb();

    const profile = {
      id: 'profile-1',
      ...stamps,
      name: 'My gym',
      location_type: 'gym' as const,
      is_default: true,
    };
    const owned = {
      id: 'owned-1',
      ...stamps,
      gym_profile_id: profile.id,
      equipment_id: 'equipment-1',
      increment_kg: 1.25,
    };
    const program = {
      id: 'program-1',
      ...stamps,
      title: 'Back day',
      description: '',
      goal: 'mass' as const,
      level: null,
      days_per_week: 3,
      visibility: 'private' as const,
      forked_from_id: null,
    };
    const day = {
      id: 'day-1',
      ...stamps,
      program_id: program.id,
      position: 0,
      title: 'Day A',
      kind: 'every_session' as const,
    };
    const item = {
      id: 'item-1',
      ...stamps,
      program_day_id: day.id,
      position: 0,
      exercise_id: 'exercise-1',
      sets: 3,
      rep_min: 8,
      rep_max: 9,
      rest_sec: 120,
      target_rir: 1,
      superset_group: 1,
      increment_kg: 2.5,
      notes: 'slow',
    };

    db.insert(gym_profiles).values(profile).run();
    db.insert(gym_equipment).values(owned).run();
    db.insert(programs).values(program).run();
    db.insert(program_days).values(day).run();
    db.insert(program_items).values(item).run();

    expect(db.select().from(gym_profiles).all()).toEqual([profile]);
    expect(db.select().from(gym_equipment).all()).toEqual([owned]);
    expect(db.select().from(programs).all()).toEqual([program]);
    expect(db.select().from(program_days).all()).toEqual([day]);
    // The range of reps is two numbers.
    expect(db.select().from(program_items).all()).toEqual([item]);
  });
});
