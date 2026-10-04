import type { Locale } from '@mvp/schemas';
import { useTranslation } from 'react-i18next';

/** The language of the interface; components that use it re-render when it changes. */
export function useLocale(): Locale {
  const { i18n } = useTranslation();
  return i18n.language === 'ru' ? 'ru' : 'en';
}
