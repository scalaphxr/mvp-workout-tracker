// i18next picks plural forms (3 of them in Russian) with Intl.PluralRules; this fills it in
// on JS engines that do not ship it.
import 'intl-pluralrules';

import type { Locale } from '@mvp/schemas';
import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { settingsStorage } from '@/lib/storage';

import en from './locales/en.json';
import ru from './locales/ru.json';

/** Same keys as the English file, any strings: a missing translation fails the type check. */
type SameKeys<T> = { [K in keyof T]: T[K] extends string ? string : SameKeys<T[K]> };
const russian: SameKeys<typeof en> = ru;

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}

export type LanguagePreference = 'system' | Locale;

const STORAGE_KEY = 'settings.language';

const i18n = createInstance();

/** Russian for a Russian system, English for every other system language. */
function systemLanguage(): Locale {
  return getLocales()[0].languageCode === 'ru' ? 'ru' : 'en';
}

export function getLanguagePreference(): LanguagePreference {
  const stored = settingsStorage.get(STORAGE_KEY);
  return stored === 'ru' || stored === 'en' ? stored : 'system';
}

export function setLanguagePreference(preference: LanguagePreference) {
  if (preference === 'system') settingsStorage.remove(STORAGE_KEY);
  else settingsStorage.set(STORAGE_KEY, preference);
  void i18n.changeLanguage(resolveLanguage(preference));
}

const resolveLanguage = (preference: LanguagePreference): Locale =>
  preference === 'system' ? systemLanguage() : preference;

/** The language the interface is shown in right now. */
export const currentLanguage = (): Locale => (i18n.language === 'ru' ? 'ru' : 'en');

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: russian } },
  lng: resolveLanguage(getLanguagePreference()),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
