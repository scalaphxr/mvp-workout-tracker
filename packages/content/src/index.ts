import type { CatalogSeed } from '@mvp/schemas';

import equipment from '../catalog/equipment.json';
import back from '../catalog/exercises/back.json';
import chest from '../catalog/exercises/chest.json';
import coreCardio from '../catalog/exercises/core-cardio.json';
import legs from '../catalog/exercises/legs.json';
import shouldersArms from '../catalog/exercises/shoulders-arms.json';
import muscles from '../catalog/muscles.json';

/**
 * The exercise catalog: what the admin import loads into the server and what the app ships with
 * as its offline baseline. The cast is safe because `catalog.test.ts` validates the files against
 * `CatalogSeedSchema`; a new exercise file has to be added to this list.
 */
export const catalogSeed = {
  equipment,
  muscles,
  exercises: [...chest, ...back, ...shouldersArms, ...legs, ...coreCardio],
} as CatalogSeed;
