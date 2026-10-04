import { and, asc, desc, eq, gym_equipment, gym_profiles, isNull, ne } from '@mvp/db/sqlite';
import {
  type GymEquipmentRow,
  type GymProfileRow,
  GymProfileRowSchema,
  type LocationType,
  type SyncChange,
} from '@mvp/schemas';

import { type DataContext, fresh } from './context';

/** Gym profiles, the default one first. */
export function listGymProfiles(ctx: DataContext): GymProfileRow[] {
  return ctx.db
    .select()
    .from(gym_profiles)
    .where(isNull(gym_profiles.deleted_at))
    .orderBy(desc(gym_profiles.is_default), asc(gym_profiles.created_at))
    .all();
}

export function getGymProfile(ctx: DataContext, id: string): GymProfileRow | null {
  return (
    ctx.db
      .select()
      .from(gym_profiles)
      .where(and(eq(gym_profiles.id, id), isNull(gym_profiles.deleted_at)))
      .get() ?? null
  );
}

/** The gym the user trains in unless they say otherwise. */
export function defaultGym(ctx: DataContext): GymProfileRow | null {
  return listGymProfiles(ctx)[0] ?? null;
}

/** What a gym has. */
export function getGymEquipment(ctx: DataContext, profileId: string): GymEquipmentRow[] {
  return ctx.db
    .select()
    .from(gym_equipment)
    .where(and(eq(gym_equipment.gym_profile_id, profileId), isNull(gym_equipment.deleted_at)))
    .all();
}

/** Equipment of a gym: equipment id → the weight step set for it (`null` – the default). */
export type EquipmentSelection = ReadonlyMap<string, number | null>;

export function createGymProfile(
  ctx: DataContext,
  input: { name: string; location_type: LocationType; equipment: EquipmentSelection },
): GymProfileRow {
  return ctx.db.transaction((tx) => {
    const inTx = { ...ctx, db: tx };
    const profile = GymProfileRowSchema.parse({
      ...fresh(ctx),
      name: input.name,
      location_type: input.location_type,
      // The first profile is the default one.
      is_default: listGymProfiles(inTx).length === 0,
    });
    tx.insert(gym_profiles).values(profile).run();
    setGymEquipment(inTx, profile.id, input.equipment);
    return profile;
  });
}

export function updateGymProfile(
  ctx: DataContext,
  id: string,
  patch: { name?: string; location_type?: LocationType },
): void {
  const profile = getGymProfile(ctx, id);
  if (!profile) return;
  const updated = GymProfileRowSchema.parse({ ...profile, ...patch, updated_at: ctx.now() });
  ctx.db.update(gym_profiles).set(updated).where(eq(gym_profiles.id, id)).run();
}

export function setDefaultGym(ctx: DataContext, id: string): void {
  if (!getGymProfile(ctx, id)) return;
  const now = ctx.now();
  ctx.db.transaction((tx) => {
    tx.update(gym_profiles)
      .set({ is_default: false, updated_at: now })
      .where(and(eq(gym_profiles.is_default, true), ne(gym_profiles.id, id)))
      .run();
    tx.update(gym_profiles)
      .set({ is_default: true, updated_at: now })
      .where(eq(gym_profiles.id, id))
      .run();
  });
}

/** Deletes a gym profile. The last one stays: programs are fitted to some gym. */
export function deleteGymProfile(ctx: DataContext, id: string): boolean {
  const profiles = listGymProfiles(ctx);
  const profile = profiles.find((candidate) => candidate.id === id);
  if (!profile || profiles.length === 1) return false;

  const now = ctx.now();
  ctx.db.transaction((tx) => {
    const gone = { deleted_at: now, updated_at: now };
    tx.update(gym_profiles)
      .set({ ...gone, is_default: false })
      .where(eq(gym_profiles.id, id))
      .run();
    tx.update(gym_equipment)
      .set(gone)
      .where(and(eq(gym_equipment.gym_profile_id, id), isNull(gym_equipment.deleted_at)))
      .run();
    if (profile.is_default) {
      const heir = profiles.find((candidate) => candidate.id !== id);
      if (heir) {
        tx.update(gym_profiles)
          .set({ is_default: true, updated_at: now })
          .where(eq(gym_profiles.id, heir.id))
          .run();
      }
    }
  });
  return true;
}

/** Makes the equipment of a gym exactly the selection, touching only the rows that change. */
export function setGymEquipment(ctx: DataContext, profileId: string, selection: EquipmentSelection) {
  const now = ctx.now();
  ctx.db.transaction((tx) => {
    // Removed rows are looked at too: ticking a box again revives its row instead of adding one.
    const rows = tx
      .select()
      .from(gym_equipment)
      .where(eq(gym_equipment.gym_profile_id, profileId))
      .all();
    const byEquipment = new Map(rows.map((row) => [row.equipment_id, row]));

    for (const row of rows) {
      if (row.deleted_at === null && !selection.has(row.equipment_id)) {
        tx.update(gym_equipment)
          .set({ deleted_at: now, updated_at: now })
          .where(eq(gym_equipment.id, row.id))
          .run();
      }
    }
    for (const [equipmentId, incrementKg] of selection) {
      const row = byEquipment.get(equipmentId);
      if (!row) {
        tx.insert(gym_equipment)
          .values({
            ...fresh(ctx),
            gym_profile_id: profileId,
            equipment_id: equipmentId,
            increment_kg: incrementKg,
          })
          .run();
      } else if (row.deleted_at !== null || row.increment_kg !== incrementKg) {
        tx.update(gym_equipment)
          .set({ deleted_at: null, increment_kg: incrementKg, updated_at: now })
          .where(eq(gym_equipment.id, row.id))
          .run();
      }
    }
  });
}

/** Everything of a gym profile for a sync push, deleted rows included. */
export function gymChanges(ctx: DataContext, profileId: string): SyncChange[] {
  const profile = ctx.db.select().from(gym_profiles).where(eq(gym_profiles.id, profileId)).get();
  if (!profile) return [];
  const equipment = ctx.db
    .select()
    .from(gym_equipment)
    .where(eq(gym_equipment.gym_profile_id, profileId))
    .all();
  return [
    { table: 'gym_profiles', op: 'upsert', row: profile },
    ...equipment.map((row): SyncChange => ({ table: 'gym_equipment', op: 'upsert', row })),
  ];
}
