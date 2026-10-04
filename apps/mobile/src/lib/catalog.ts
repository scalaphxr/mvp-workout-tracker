import { catalogSeed } from '@mvp/content';
import type { Catalog, Equipment, Exercise, Muscle } from '@mvp/schemas';
import { create } from 'zustand';

import { api } from './api';
import { settingsStorage } from './storage';

const STORAGE_KEY = 'catalog.cache';

/** The catalog with lookups by the keys records refer to each other with. */
export interface CatalogIndex {
  catalog: Catalog;
  exerciseById: ReadonlyMap<string, Exercise>;
  exerciseBySlug: ReadonlyMap<string, Exercise>;
  muscleByCode: ReadonlyMap<string, Muscle>;
  equipmentByCode: ReadonlyMap<string, Equipment>;
}

function index(catalog: Catalog): CatalogIndex {
  return {
    catalog,
    exerciseById: new Map(catalog.exercises.map((exercise) => [exercise.id, exercise])),
    exerciseBySlug: new Map(catalog.exercises.map((exercise) => [exercise.slug, exercise])),
    muscleByCode: new Map(catalog.muscles.map((muscle) => [muscle.code, muscle])),
    equipmentByCode: new Map(catalog.equipment.map((item) => [item.code, item])),
  };
}

/**
 * The catalog downloaded from the server, or the one shipped inside the app (version 0) when
 * nothing was downloaded yet: the library works from the first launch without a network.
 */
function loadCatalog(): Catalog {
  try {
    const cached = settingsStorage.get(STORAGE_KEY);
    if (cached) return JSON.parse(cached) as Catalog;
  } catch {
    // An unreadable cache is the same as no cache.
  }
  return { ...catalogSeed, version: 0 };
}

export const useCatalog = create<CatalogIndex>(() => index(loadCatalog()));

/** Downloads the catalog when the server has a newer version than the phone. */
export async function syncCatalog(): Promise<number> {
  const current = useCatalog.getState().catalog.version;
  const { version } = await api.catalogVersion();
  if (version <= current) return current;

  const { catalog } = await api.catalog(current);
  if (!catalog) return current;

  useCatalog.setState(index(catalog));
  try {
    settingsStorage.set(STORAGE_KEY, JSON.stringify(catalog));
  } catch {
    // No room for the cache: the catalog is downloaded again on the next launch.
  }
  return catalog.version;
}
