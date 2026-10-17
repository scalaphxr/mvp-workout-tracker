import { describe, expect, it } from 'vitest';

import { cardioFields, formatClock, parseDuration, parseNumber } from './cardio';

describe('the fields of a cardio set', () => {
  it('follow the display of the machine', () => {
    expect(cardioFields(['treadmill'])).toContain('incline_pct');
    expect(cardioFields(['treadmill'])).toContain('speed_kmh');
    expect(cardioFields(['stationary_bike'])).toContain('resistance_level');
    expect(cardioFields(['stationary_bike'])).not.toContain('incline_pct');
    expect(cardioFields(['jump_rope'])).not.toContain('distance_m');
  });

  it('fall back to distance, heart rate and calories without a known machine', () => {
    expect(cardioFields([])).toEqual(['distance_m', 'avg_hr', 'calories']);
    expect(cardioFields(['mat'])).toEqual(['distance_m', 'avg_hr', 'calories']);
  });
});

describe('numbers typed by hand', () => {
  it.each([
    ['4.2', 4.2],
    ['4,2', 4.2],
    [' 145 ', 145],
    ['-2', -2],
  ])('reads %s', (text, value) => {
    expect(parseNumber(text)).toBe(value);
  });

  it.each(['', ' ', 'abc', '4.2.1', '4,'])('rejects "%s"', (text) => {
    expect(parseNumber(text)).toBeNull();
  });
});

describe('a time typed by hand', () => {
  it.each([
    ['25', 25 * 60],
    ['25,5', 25 * 60 + 30],
    ['25:30', 25 * 60 + 30],
    ['0:45', 45],
    ['1:05:00', 65 * 60],
  ])('reads %s', (text, seconds) => {
    expect(parseDuration(text)).toBe(seconds);
  });

  it.each(['', '0', '0:00', '25:75', '1:2:3:4', 'abc', '-5', '25 min', '25:3a', '25:00:00:00', '1500'])(
    'rejects "%s"',
    (text) => {
      expect(parseDuration(text)).toBeNull();
    },
  );

  it('is written back the way it is read', () => {
    expect(formatClock(25 * 60 + 30)).toBe('25:30');
    expect(formatClock(45)).toBe('0:45');
    expect(formatClock(65 * 60)).toBe('1:05:00');
    for (const seconds of [45, 1530, 3900]) expect(parseDuration(formatClock(seconds))).toBe(seconds);
  });
});
