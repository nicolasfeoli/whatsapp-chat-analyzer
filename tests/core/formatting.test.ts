import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  calendarDaysBetween,
  dateFromDayKey,
  dayKeyFromDate,
  formatDuration,
  median,
  mondayFirstWeekdayIndexOf,
  sortableDayNumber,
  startOfDay,
} from '../../src/core/formatting';
import {
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_SECOND,
} from '../../src/core/time-constants';
import { localMidnight, localTime } from '../fixtures/messages';

describe('formatDuration', () => {
  it.each([
    { description: 'zero as one second, never "0 s"', milliseconds: 0, expected: '1 s' },
    {
      description: 'less than a second as one second',
      milliseconds: 400,
      expected: '1 s',
    },
    {
      description: 'whole seconds below a minute',
      milliseconds: 45 * MILLISECONDS_PER_SECOND,
      expected: '45 s',
    },
    {
      description: 'seconds rounded to the nearest whole second',
      milliseconds: 1_600,
      expected: '2 s',
    },
    {
      description: 'exactly one minute in minutes',
      milliseconds: MILLISECONDS_PER_MINUTE,
      expected: '1 min',
    },
    {
      description: 'minutes rounded to the nearest whole minute',
      milliseconds: 12 * MILLISECONDS_PER_MINUTE + 20 * MILLISECONDS_PER_SECOND,
      expected: '12 min',
    },
    {
      description: 'exactly one hour with one decimal',
      milliseconds: MILLISECONDS_PER_HOUR,
      expected: '1.0 h',
    },
    {
      description: 'an hour and a half with one decimal',
      milliseconds: 1.5 * MILLISECONDS_PER_HOUR,
      expected: '1.5 h',
    },
    {
      description: 'ten hours and more without a decimal',
      milliseconds: 10 * MILLISECONDS_PER_HOUR,
      expected: '10 h',
    },
    {
      description: 'a day and a half still in hours',
      milliseconds: 36 * MILLISECONDS_PER_HOUR,
      expected: '36 h',
    },
    {
      description: 'exactly two days in days',
      milliseconds: 2 * MILLISECONDS_PER_DAY,
      expected: '2 days',
    },
    {
      description: 'days rounded to the nearest whole day',
      milliseconds: 9 * MILLISECONDS_PER_DAY + 5 * MILLISECONDS_PER_HOUR,
      expected: '9 days',
    },
  ])('writes $description', ({ milliseconds, expected }) => {
    expect(formatDuration(milliseconds)).toBe(expected);
  });

  it.each([
    {
      description: 'just below a minute',
      milliseconds: MILLISECONDS_PER_MINUTE - 1,
      expected: '60 s',
    },
    {
      description: 'just below an hour',
      milliseconds: MILLISECONDS_PER_HOUR - 1,
      expected: '60 min',
    },
    {
      description: 'just below ten hours',
      milliseconds: 10 * MILLISECONDS_PER_HOUR - 1,
      expected: '10.0 h',
    },
    {
      description: 'just below two days',
      milliseconds: 2 * MILLISECONDS_PER_DAY - 1,
      expected: '48 h',
    },
  ])(
    'keeps the smaller unit for a duration $description, even when rounding fills it up',
    ({ milliseconds, expected }) => {
      expect(formatDuration(milliseconds)).toBe(expected);
    },
  );
});

describe('median', () => {
  it('returns null for an empty list', () => {
    expect(median([])).toBeNull();
  });

  it('returns the only value of a list of one', () => {
    expect(median([7])).toBe(7);
  });

  it('returns the middle value of a list of odd length', () => {
    expect(median([1, 5, 9])).toBe(5);
  });

  it('returns the mean of the two middle values of a list of even length', () => {
    expect(median([1, 2, 4, 9])).toBe(3);
  });

  it('sorts the values first, so their order does not matter', () => {
    expect(median([9, 1, 5])).toBe(5);
  });

  it('sorts by value rather than as text, so 10 comes after 9', () => {
    expect(median([10, 9, 100])).toBe(10);
  });

  it('counts repeated values once each', () => {
    expect(median([0, 0, 0, 60_000])).toBe(0);
  });

  it('does not reorder the list it was given', () => {
    const values = [3, 1, 2];

    median(values);

    expect(values).toEqual([3, 1, 2]);
  });
});

describe('startOfDay', () => {
  it('returns midnight of the same local day', () => {
    const lateEvening = localTime('2024-01-13 23:59:59');

    const midnight = startOfDay(lateEvening);

    expect(midnight).toEqual(localMidnight('2024-01-13'));
  });

  it('returns a new date and leaves the given one alone', () => {
    const moment = localTime('2024-01-13 10:30');

    startOfDay(moment);

    expect(moment).toEqual(localTime('2024-01-13 10:30'));
  });
});

describe('dayKeyFromDate', () => {
  it('writes a day as the number YYYYMMDD', () => {
    expect(dayKeyFromDate(localTime('2024-01-13 10:00'))).toBe(20240113);
  });

  it('pads single-digit months and days, so keys sort chronologically', () => {
    const earlierDay = dayKeyFromDate(localTime('2024-02-09 10:00'));
    const laterDay = dayKeyFromDate(localTime('2024-10-01 10:00'));

    expect(earlierDay).toBe(20240209);
    expect(earlierDay).toBeLessThan(laterDay);
  });

  it('gives every moment of one day the same key', () => {
    const firstSecond = dayKeyFromDate(localTime('2024-12-31 00:00:00'));
    const lastSecond = dayKeyFromDate(localTime('2024-12-31 23:59:59'));

    expect(firstSecond).toBe(lastSecond);
  });
});

describe('dateFromDayKey', () => {
  it('returns local midnight of the day the key stands for', () => {
    expect(dateFromDayKey(20240113)).toEqual(localMidnight('2024-01-13'));
  });

  it.each(['2024-01-01', '2024-02-29', '2024-10-09', '2024-12-31'])(
    'is the inverse of dayKeyFromDate for %s',
    (localDate) => {
      const midnight = localMidnight(localDate);

      expect(dateFromDayKey(dayKeyFromDate(midnight))).toEqual(midnight);
    },
  );
});

describe('sortableDayNumber', () => {
  it('writes the year, the month and the day as the digits YYYYMMDD', () => {
    expect(sortableDayNumber(2024, 1, 13)).toBe(20240113);
  });

  it('orders days chronologically across the end of a month and of a year', () => {
    const lastOfJanuary = sortableDayNumber(2024, 1, 31);
    const firstOfFebruary = sortableDayNumber(2024, 2, 1);
    const lastOfDecember = sortableDayNumber(2023, 12, 31);

    expect(lastOfDecember).toBeLessThan(lastOfJanuary);
    expect(lastOfJanuary).toBeLessThan(firstOfFebruary);
  });

  it('agrees with the day key of the same date', () => {
    expect(sortableDayNumber(2024, 1, 13)).toBe(dayKeyFromDate(localMidnight('2024-01-13')));
  });
});

describe('mondayFirstWeekdayIndexOf', () => {
  /* 1 January 2024 was a Monday, so the first seven days of that year are one whole week. */
  it.each([
    { dayOfMonth: 1, weekday: 'Monday', expected: 0 },
    { dayOfMonth: 2, weekday: 'Tuesday', expected: 1 },
    { dayOfMonth: 3, weekday: 'Wednesday', expected: 2 },
    { dayOfMonth: 4, weekday: 'Thursday', expected: 3 },
    { dayOfMonth: 5, weekday: 'Friday', expected: 4 },
    { dayOfMonth: 6, weekday: 'Saturday', expected: 5 },
    { dayOfMonth: 7, weekday: 'Sunday', expected: 6 },
  ])('gives $expected for a $weekday', ({ dayOfMonth, expected }) => {
    expect(mondayFirstWeekdayIndexOf(localMidnight(`2024-01-0${dayOfMonth}`))).toBe(expected);
  });

  it('goes by the local day, also in its last minute', () => {
    expect(mondayFirstWeekdayIndexOf(localTime('2024-01-07 23:59'))).toBe(6);
  });
});

describe('calendarDaysBetween', () => {
  it('is zero for the same day', () => {
    const day = localMidnight('2024-01-13');

    expect(calendarDaysBetween(day, day)).toBe(0);
  });

  it('counts the days from the first midnight to the second', () => {
    expect(calendarDaysBetween(localMidnight('2024-01-13'), localMidnight('2024-01-20'))).toBe(7);
  });

  it('counts the leap day of a leap year', () => {
    expect(calendarDaysBetween(localMidnight('2024-02-28'), localMidnight('2024-03-01'))).toBe(2);
  });

  it('is negative when the days are given in the wrong order', () => {
    expect(calendarDaysBetween(localMidnight('2024-01-20'), localMidnight('2024-01-13'))).toBe(-7);
  });
});

describe('calendar days in a time zone that changes its clocks', () => {
  const originalTimeZone = process.env['TZ'];

  beforeAll(() => {
    /* Madrid moved its clocks forward on 31 March 2024 and back on 27 October 2024. */
    process.env['TZ'] = 'Europe/Madrid';
  });

  afterAll(() => {
    if (originalTimeZone === undefined) {
      delete process.env['TZ'];
    } else {
      process.env['TZ'] = originalTimeZone;
    }
  });

  it('counts the 23-hour day on which the clocks go forward as one day', () => {
    const dayOfTheChange = localMidnight('2024-03-31');
    const dayAfter = localMidnight('2024-04-01');

    expect(dayAfter.getTime() - dayOfTheChange.getTime()).toBe(23 * MILLISECONDS_PER_HOUR);
    expect(calendarDaysBetween(dayOfTheChange, dayAfter)).toBe(1);
  });

  it('counts the 25-hour day on which the clocks go back as one day', () => {
    const dayOfTheChange = localMidnight('2024-10-27');
    const dayAfter = localMidnight('2024-10-28');

    expect(dayAfter.getTime() - dayOfTheChange.getTime()).toBe(25 * MILLISECONDS_PER_HOUR);
    expect(calendarDaysBetween(dayOfTheChange, dayAfter)).toBe(1);
  });
});
