import { describe, expect, it } from 'vitest';

import { cardioFields, findCardioRecords, formatClock, parseDuration, parseNumber } from './cardio';

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

describe('records of cardio', () => {
  const run = (distance_m: number | null, minutes: number) => ({
    reps: null,
    duration_sec: minutes * 60,
    distance_m,
  });

  it('are the longest distance and the longest time against everything before', () => {
    const earlier = [run(4200, 25), run(5000, 30)];
    expect(findCardioRecords([run(5100, 28)], earlier)).toEqual([{ kind: 'distance', value: 5100 }]);
    expect(findCardioRecords([run(4000, 35)], earlier)).toEqual([{ kind: 'duration', value: 35 * 60 }]);
    expect(findCardioRecords([run(6000, 40)], earlier)).toEqual([
      { kind: 'distance', value: 6000 },
      { kind: 'duration', value: 40 * 60 },
    ]);
  });

  it('take the best set of a workout and need to beat, not to equal', () => {
    const earlier = [run(5000, 30)];
    expect(findCardioRecords([run(5000, 30)], earlier)).toEqual([]);
    expect(findCardioRecords([run(2000, 10), run(5500, 20)], earlier)).toEqual([
      { kind: 'distance', value: 5500 },
    ]);
  });

  it('are not set the first time, nor for a distance never logged before', () => {
    expect(findCardioRecords([run(5000, 30)], [])).toEqual([]);
    expect(findCardioRecords([run(5000, 20)], [run(null, 25)])).toEqual([]);
  });

  it('count a hold on time too, and leave sets with reps alone', () => {
    const plank = (seconds: number) => ({ reps: null, duration_sec: seconds, distance_m: null });
    expect(findCardioRecords([plank(90)], [plank(60)])).toEqual([{ kind: 'duration', value: 90 }]);
    const lifted = { reps: 10, duration_sec: 600, distance_m: null };
    expect(findCardioRecords([lifted], [plank(60)])).toEqual([]);
  });
});
