import type { KeyValueStorage } from './storage';

// The web build exists only for development: there is no secure storage in a browser.
const browserStorage: KeyValueStorage = {
  get: (key) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  set: (key, value) => localStorage.setItem(key, value),
  remove: (key) => localStorage.removeItem(key),
};

export const secureStorage = browserStorage;
export const settingsStorage = browserStorage;
