import type { Units } from '@mvp/schemas';
import { getLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/hooks/use-locale';

import { formatWeight } from './format';
import { usePreferences } from './preferences';

export { formatWeight, fromUnits, toUnits } from './format';
export type { Units };

/** Kilograms by default; pounds where people weigh in pounds (spec, "Локализация"). */
export function regionUnits(): Units {
  const region = getLocales()[0]?.regionCode;
  return region === 'US' || region === 'LR' || region === 'MM' ? 'lb' : 'kg';
}

/** The units the user sees weights in. Weights are stored in kilograms whatever they are. */
export function currentUnits(): Units {
  return usePreferences.getState().units ?? regionUnits();
}

export function useUnits(): Units {
  return usePreferences((state) => state.units) ?? regionUnits();
}

/** A formatter of weights in the user's units; a screen using it follows a change of units. */
export function useWeightFormat(): (kg: number) => string {
  const { t } = useTranslation();
  const locale = useLocale();
  const units = useUnits();
  return (kg) => formatWeight(t, locale, kg, units);
}
