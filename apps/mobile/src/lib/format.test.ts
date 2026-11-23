import { createInstance, type TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import en from '../i18n/locales/en.json';
import ru from '../i18n/locales/ru.json';
import { formatTotalTime } from './format';

async function translator(lng: 'ru' | 'en') {
  const i18n = createInstance();
  await i18n.init({ resources: { en: { translation: en }, ru: { translation: ru } }, lng });
  return i18n.t as TFunction;
}

describe('formatTotalTime', () => {
  it('writes an hour and more in hours and minutes, to the minute', async () => {
    const t = await translator('ru');
    expect(formatTotalTime(t, 228 * 60)).toBe('3 ч 48 мин');
    expect(formatTotalTime(t, 120 * 60)).toBe('2 ч');
    expect(formatTotalTime(t, 59 * 60 + 40)).toBe('1 ч');
    expect(formatTotalTime(t, 45 * 60 + 10)).toBe('45 мин');
    expect(formatTotalTime(t, 5)).toBe('1 мин');
  });

  it('in English too', async () => {
    const t = await translator('en');
    expect(formatTotalTime(t, 189 * 60)).toBe('3 h 9 min');
  });
});
