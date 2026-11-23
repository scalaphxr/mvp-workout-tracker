import type { CatalogSeed } from '@mvp/schemas';

import equipmentExpansion from '../catalog/equipment-expansion.json';
import equipment from '../catalog/equipment.json';
import exerciseAliases from '../catalog/exercise-aliases.json';
import back from '../catalog/exercises/back.json';
import bodyweight from '../catalog/exercises/bodyweight.json';
import chest from '../catalog/exercises/chest.json';
import coreCardio from '../catalog/exercises/core-cardio.json';
import expandedBodyweight from '../catalog/exercises/expansion-bodyweight.json';
import expandedCardio from '../catalog/exercises/expansion-cardio.json';
import expandedMobility from '../catalog/exercises/expansion-mobility.json';
import expandedStrength from '../catalog/exercises/expansion-strength.json';
import isolation from '../catalog/exercises/isolation.json';
import legs from '../catalog/exercises/legs.json';
import mobility from '../catalog/exercises/mobility.json';
import shouldersArms from '../catalog/exercises/shoulders-arms.json';
import muscles from '../catalog/muscles.json';

/**
 * The exercise catalog: what the admin import loads into the server and what the app ships with
 * as its offline baseline. The cast is safe because `catalog.test.ts` validates the files against
 * `CatalogSeedSchema`; a new exercise file has to be added to this list.
 */
const exercises = [
  ...chest,
  ...back,
  ...shouldersArms,
  ...isolation,
  ...legs,
  ...bodyweight,
  ...coreCardio,
  ...mobility,
  ...expandedStrength,
  ...expandedBodyweight,
  ...expandedCardio,
  ...expandedMobility,
] as CatalogSeed['exercises'];

const aliasesBySlug: Readonly<Record<string, { ru: string[]; en: string[] }>> = exerciseAliases;

export const catalogSeed: CatalogSeed = {
  equipment: [...equipment, ...equipmentExpansion] as CatalogSeed['equipment'],
  muscles: muscles as CatalogSeed['muscles'],
  exercises: exercises.map((exercise) => {
    const aliases = aliasesBySlug[exercise.slug];
    if (!aliases) return exercise;

    const { ru, en } = exercise.translations;
    return {
      ...exercise,
      translations: {
        ru: { ...ru, aliases: [...ru.aliases, ...aliases.ru] },
        en: { ...en, aliases: [...en.aliases, ...aliases.en] },
      },
    };
  }),
};

export { programTemplates } from './templates';
