import { describe, expect, it } from 'vitest';

import { toLocalDate } from './format';
import { weekOf } from './week';

const dates = (at: Date) => weekOf(at).map(toLocalDate);

describe('weekOf', () => {
  it('starts on the Monday of the week, at midnight', () => {
    // Wednesday 11 November 2026.
    const week = weekOf(new Date(2026, 10, 11, 18, 30));
    expect(week.map(toLocalDate)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(week[0]!.getHours()).toBe(0);
  });

  it('keeps Sunday in the week that began on the Monday before it', () => {
    expect(dates(new Date(2026, 10, 15, 23))[0]).toBe('2026-11-09');
    expect(dates(new Date(2026, 10, 16, 0, 1))[0]).toBe('2026-11-16');
  });

  it('crosses the end of a month and of a year', () => {
    expect(dates(new Date(2026, 11, 31))).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });
});
