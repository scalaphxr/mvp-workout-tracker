import { DEFAULT_STEPS_KG, LOCATION_PRESETS, type StepGroup, stepGroup } from '@mvp/domain';
import type { Catalog, GymProfileRow, LocationType } from '@mvp/schemas';

import type { DataContext } from '@/data/context';
import {
  createGymProfile,
  defaultGym,
  type EquipmentSelection,
  getGymEquipment,
  listGymProfiles,
} from '@/data/gym';

import { useCatalog } from './catalog';
import { useLocal } from './local';

/** The equipment a new place of this kind starts with, at default weight steps. */
export function presetSelection(catalog: Catalog, location: LocationType): EquipmentSelection {
  const codes = LOCATION_PRESETS[location];
  return new Map(
    catalog.equipment
      .filter((item) => codes === null || codes.includes(item.code))
      .map((item) => [item.id, null]),
  );
}

/**
 * A user who skipped the gym setup trains in a fully equipped gym (spec 4.1): on the first
 * launch such a profile is created.
 */
export function ensureDefaultGym(ctx: DataContext, catalog: Catalog, name: string): void {
  if (listGymProfiles(ctx).length > 0) return;
  createGymProfile(ctx, {
    name,
    location_type: 'gym',
    equipment: presetSelection(catalog, 'gym'),
  });
}

export interface GymView {
  profile: GymProfileRow;
  /** Equipment codes the gym has. */
  equipment: ReadonlySet<string>;
  /** Weight steps set in the gym, by equipment code. */
  steps: ReadonlyMap<string, number | null>;
}

function viewOf(ctx: DataContext, catalog: Catalog, profile: GymProfileRow): GymView {
  const codeById = new Map(catalog.equipment.map((item) => [item.id, item.code]));
  const steps = new Map<string, number | null>();
  for (const row of getGymEquipment(ctx, profile.id)) {
    const code = codeById.get(row.equipment_id);
    if (code) steps.set(code, row.increment_kg);
  }
  return { profile, equipment: new Set(steps.keys()), steps };
}

/** A gym profile with its equipment as codes; `id` omitted – the main gym. */
export function useGym(id?: string): GymView | null {
  const { catalog } = useCatalog();
  return useLocal((ctx) => {
    const profile = id
      ? listGymProfiles(ctx).find((candidate) => candidate.id === id)
      : defaultGym(ctx);
    return profile ? viewOf(ctx, catalog, profile) : null;
  });
}

/** The three weight steps of a gym, as the profile screen shows them. */
export function stepsOf(catalog: Catalog, gym: GymView): Record<StepGroup, number> {
  const steps = { ...DEFAULT_STEPS_KG };
  for (const item of catalog.equipment) {
    const group = stepGroup(item);
    const set = gym.steps.get(item.code);
    if (group && set != null) steps[group] = set;
  }
  return steps;
}
