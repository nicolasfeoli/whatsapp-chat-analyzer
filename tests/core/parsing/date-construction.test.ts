import { describe, expect, it } from 'vitest';

import { buildTimestamp } from '../../../src/core/parsing/date-construction';
import type { TimestampParts } from '../../../src/core/parsing/date-construction';
import { localTime } from '../../fixtures/messages';

/**
 * Builds the numbers of a timestamp; anything left out reads `1/1/24, 10:00:00`
 * on a 24-hour clock.
 */
function timestampParts(overrides: Partial<TimestampParts> = {}): TimestampParts {
  return {
    firstDateNumber: 1,
    secondDateNumber: 1,
    thirdDateNumber: 24,
    hour: 10,
    minute: 0,
    second: 0,
    meridiem: null,
    ...overrides,
  };
}

describe('buildTimestamp', () => {
  describe('date orders', () => {
    it('reads day, month, year', () => {
      const parts = timestampParts({
        firstDateNumber: 3,
        secondDateNumber: 4,
        thirdDateNumber: 2024,
      });

      expect(buildTimestamp(parts, 'dmy')).toEqual(localTime('2024-04-03 10:00'));
    });

    it('reads month, day, year', () => {
      const parts = timestampParts({
        firstDateNumber: 3,
        secondDateNumber: 4,
        thirdDateNumber: 2024,
      });

      expect(buildTimestamp(parts, 'mdy')).toEqual(localTime('2024-03-04 10:00'));
    });

    it('reads year, month, day', () => {
      const parts = timestampParts({
        firstDateNumber: 2024,
        secondDateNumber: 3,
        thirdDateNumber: 4,
      });

      expect(buildTimestamp(parts, 'ymd')).toEqual(localTime('2024-03-04 10:00'));
    });
  });

  describe('time of day', () => {
    it('keeps hour, minute and second as written on a 24-hour clock', () => {
      const parts = timestampParts({ hour: 22, minute: 5, second: 59 });

      expect(buildTimestamp(parts, 'dmy')).toEqual(localTime('2024-01-01 22:05:59'));
    });

    it.each([
      { written: '12 AM', hour: 12, meridiem: 'am', expectedHour: 0 },
      { written: '1 AM', hour: 1, meridiem: 'am', expectedHour: 1 },
      { written: '11 AM', hour: 11, meridiem: 'am', expectedHour: 11 },
      { written: '12 PM', hour: 12, meridiem: 'pm', expectedHour: 12 },
      { written: '1 PM', hour: 1, meridiem: 'pm', expectedHour: 13 },
      { written: '11 PM', hour: 11, meridiem: 'pm', expectedHour: 23 },
    ] as const)('reads $written as hour $expectedHour', ({ hour, meridiem, expectedHour }) => {
      const parts = timestampParts({ hour, meridiem });

      expect(buildTimestamp(parts, 'dmy')?.getHours()).toBe(expectedHour);
    });

    it('reads midnight on a 24-hour clock', () => {
      const parts = timestampParts({ hour: 0, minute: 0 });

      expect(buildTimestamp(parts, 'dmy')).toEqual(localTime('2024-01-01 00:00'));
    });
  });

  describe('two-digit years', () => {
    it.each([
      { written: 24, expectedYear: 2024 },
      { written: 9, expectedYear: 2009 },
      { written: 0, expectedYear: 2000 },
      { written: 99, expectedYear: 2099 },
    ])('reads the year $written as $expectedYear', ({ written, expectedYear }) => {
      const parts = timestampParts({ thirdDateNumber: written });

      expect(buildTimestamp(parts, 'dmy')?.getFullYear()).toBe(expectedYear);
    });

    it('leaves a four-digit year alone', () => {
      const parts = timestampParts({ thirdDateNumber: 2019 });

      expect(buildTimestamp(parts, 'mdy')?.getFullYear()).toBe(2019);
    });

    it('does not expand the year of a year-first date', () => {
      const parts = timestampParts({
        firstDateNumber: 2019,
        secondDateNumber: 6,
        thirdDateNumber: 15,
      });

      expect(buildTimestamp(parts, 'ymd')).toEqual(localTime('2019-06-15 10:00'));
    });
  });

  describe('dates that do not exist', () => {
    it.each([
      { description: '31 February', day: 31, month: 2, year: 24 },
      { description: '30 February', day: 30, month: 2, year: 24 },
      { description: '29 February of a year that is not a leap year', day: 29, month: 2, year: 23 },
      { description: '31 April', day: 31, month: 4, year: 24 },
      { description: 'day 32', day: 32, month: 1, year: 24 },
      { description: 'day 0', day: 0, month: 1, year: 24 },
      { description: 'month 13', day: 1, month: 13, year: 24 },
      { description: 'month 0', day: 1, month: 0, year: 24 },
    ])('rejects $description instead of rolling it over', ({ day, month, year }) => {
      const parts = timestampParts({
        firstDateNumber: day,
        secondDateNumber: month,
        thirdDateNumber: year,
      });

      expect(buildTimestamp(parts, 'dmy')).toBeNull();
    });

    it('accepts 29 February of a leap year', () => {
      const parts = timestampParts({
        firstDateNumber: 29,
        secondDateNumber: 2,
        thirdDateNumber: 24,
      });

      expect(buildTimestamp(parts, 'dmy')).toEqual(localTime('2024-02-29 10:00'));
    });

    it('rejects a day-first date read as month first, which is how a wrong date order shows', () => {
      const parts = timestampParts({
        firstDateNumber: 31,
        secondDateNumber: 12,
        thirdDateNumber: 23,
      });

      expect(buildTimestamp(parts, 'mdy')).toBeNull();
    });

    it('rejects an impossible day in a year-first date', () => {
      const parts = timestampParts({
        firstDateNumber: 2024,
        secondDateNumber: 2,
        thirdDateNumber: 31,
      });

      expect(buildTimestamp(parts, 'ymd')).toBeNull();
    });
  });

  describe('times that do not exist', () => {
    it('rejects hour 24', () => {
      expect(buildTimestamp(timestampParts({ hour: 24 }), 'dmy')).toBeNull();
    });

    it('wraps an hour above 12 written with a 12-hour marker, so "13 AM" reads as one o\'clock', () => {
      const parts = timestampParts({ hour: 13, meridiem: 'am' });

      expect(buildTimestamp(parts, 'dmy')?.getHours()).toBe(1);
    });

    it('rejects minute 60', () => {
      expect(buildTimestamp(timestampParts({ minute: 60 }), 'dmy')).toBeNull();
    });

    it('accepts hour 23 and minute 59, the last of the day', () => {
      const parts = timestampParts({ hour: 23, minute: 59 });

      expect(buildTimestamp(parts, 'dmy')).toEqual(localTime('2024-01-01 23:59'));
    });

    it('rejects numbers that are not numbers at all', () => {
      const parts = timestampParts({ firstDateNumber: Number.NaN });

      expect(buildTimestamp(parts, 'dmy')).toBeNull();
    });
  });
});
