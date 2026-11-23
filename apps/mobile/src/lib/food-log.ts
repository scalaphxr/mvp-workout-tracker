import { settingsStorage } from './storage';

export interface FoodEntry {
  id: string;
  text: string;
  kcal?: number;
}

export function readFoodEntries(date: string): FoodEntry[] {
  const stored = settingsStorage.get(`food.entries.${date}`);
  return stored === null ? [] : JSON.parse(stored) as FoodEntry[];
}

export function addFoodEntry(date: string, entry: FoodEntry): void {
  const entries = [entry, ...readFoodEntries(date)];
  settingsStorage.set(`food.entries.${date}`, JSON.stringify(entries));
}
