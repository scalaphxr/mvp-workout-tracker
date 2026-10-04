import * as SecureStore from 'expo-secure-store';
import { Storage } from 'expo-sqlite/kv-store';

export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Secrets (tokens): Keychain on iOS, Keystore-encrypted storage on Android. */
export const secureStorage: KeyValueStorage = {
  get: (key) => SecureStore.getItem(key),
  set: (key, value) => SecureStore.setItem(key, value),
  remove: (key) => void SecureStore.deleteItemAsync(key),
};

/** Plain settings that are not worth a table of their own. */
export const settingsStorage: KeyValueStorage = {
  get: (key) => Storage.getItemSync(key),
  set: (key, value) => Storage.setItemSync(key, value),
  remove: (key) => void Storage.removeItemSync(key),
};
