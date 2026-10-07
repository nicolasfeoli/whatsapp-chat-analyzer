import { describe, expect, it } from 'vitest';

import {
  MONTH_ABBREVIATIONS,
  WEEKDAY_NAMES,
  formatBubbleTimestamp,
  formatClockTime,
  formatCountWithNoun,
  formatLongDate,
  formatPercentage,
  formatShortDate,
  formatTwoDigitYear,
  formatWholeNumber,
  monthAbbreviationOf,
  padToTwoDigits,
  weekdayNameOf,
} from '../../src/ui/text-formatting';
import { localTime } from '../fixtures/messages';

describe('formatWholeNumber', () => {
  it.each([
    { value: 0, expected: '0' },
    { value: 999, expected: '999' },
    { value: 1000, expected: '1,000' },
    { value: 1234567, expected: '1,234,567' },
  ])('writes $value as $expected', ({ value, expected }) => {
    expect(formatWholeNumber(value)).toBe(expected);
  });

  it.each([
    { value: 12.4, expected: '12' },
    { value: 12.5, expected: '13' },
    { value: 999.5, expected: '1,000' },
  ])('rounds $value to $expected', ({ value, expected }) => {
    expect(formatWholeNumber(value)).toBe(expected);
  });
});

describe('formatPercentage', () => {
  it.each([
    { fraction: 0, expected: '0.0%' },
    { fraction: 0.042, expected: '4.2%' },
    { fraction: 0.0999, expected: '10.0%' },
  ])('shows one decimal below a tenth: $fraction as $expected', ({ fraction, expected }) => {
    expect(formatPercentage(fraction)).toBe(expected);
  });

  it.each([
    { fraction: 0.1, expected: '10%' },
    { fraction: 0.634, expected: '63%' },
    { fraction: 1, expected: '100%' },
  ])('shows no decimal from a tenth up: $fraction as $expected', ({ fraction, expected }) => {
    expect(formatPercentage(fraction)).toBe(expected);
  });
});

describe('padToTwoDigits', () => {
  it.each([
    { value: 0, expected: '00' },
    { value: 7, expected: '07' },
    { value: 23, expected: '23' },
  ])('writes $value as $expected', ({ value, expected }) => {
    expect(padToTwoDigits(value)).toBe(expected);
  });

  it('leaves a longer number as it is', () => {
    expect(padToTwoDigits(2024)).toBe('2024');
  });
});

describe('month and weekday names', () => {
  it('lists twelve months starting with January', () => {
    expect(MONTH_ABBREVIATIONS).toHaveLength(12);
    expect(MONTH_ABBREVIATIONS[0]).toBe('Jan');
    expect(MONTH_ABBREVIATIONS[11]).toBe('Dec');
  });

  it('lists seven weekdays starting with Monday', () => {
    expect(WEEKDAY_NAMES).toHaveLength(7);
    expect(WEEKDAY_NAMES[0]).toBe('Monday');
    expect(WEEKDAY_NAMES[6]).toBe('Sunday');
  });

  it('names the month a moment falls in', () => {
    expect(monthAbbreviationOf(localTime('2024-03-10 15:04'))).toBe('Mar');
  });

  it('names a weekday by its row in the heatmap', () => {
    expect(weekdayNameOf(2)).toBe('Wednesday');
  });

  it.each([{ weekdayIndex: -1 }, { weekdayIndex: 7 }])(
    'returns an empty name for weekday $weekdayIndex, which does not exist',
    ({ weekdayIndex }) => {
      expect(weekdayNameOf(weekdayIndex)).toBe('');
    },
  );
});

describe('dates and times', () => {
  const morningOfFifthOfJanuary = localTime('2026-01-05 08:05');

  it('writes a long date as day, month name and year', () => {
    expect(formatLongDate(morningOfFifthOfJanuary)).toBe('5 Jan 2026');
  });

  it('writes a short date without the year', () => {
    expect(formatShortDate(morningOfFifthOfJanuary)).toBe('5 Jan');
  });

  it('writes the time on a 24 hour clock with leading zeros', () => {
    expect(formatClockTime(morningOfFifthOfJanuary)).toBe('08:05');
  });

  it('writes an evening time without converting to 12 hours', () => {
    expect(formatClockTime(localTime('2026-01-05 23:59'))).toBe('23:59');
  });

  it('writes the year without its century', () => {
    expect(formatTwoDigitYear(morningOfFifthOfJanuary)).toBe('26');
  });

  it('keeps the zero of a year early in its century', () => {
    expect(formatTwoDigitYear(localTime('2009-02-24 12:00'))).toBe('09');
  });

  it('writes a bubble timestamp as padded day, month, year and time', () => {
    expect(formatBubbleTimestamp(morningOfFifthOfJanuary)).toBe('05/01/2026 08:05');
  });
});

describe('formatCountWithNoun', () => {
  it('uses the singular for exactly one', () => {
    expect(formatCountWithNoun(1, 'line', 'lines')).toBe('1 line');
  });

  it.each([{ count: 0 }, { count: 2 }])('uses the plural for $count', ({ count }) => {
    expect(formatCountWithNoun(count, 'line', 'lines')).toBe(`${count} lines`);
  });

  it('groups the digits of a large count', () => {
    expect(formatCountWithNoun(2340, 'line', 'lines')).toBe('2,340 lines');
  });

  it('accepts a noun phrase that carries its verb', () => {
    expect(formatCountWithNoun(1, 'entry has', 'entries have')).toBe('1 entry has');
    expect(formatCountWithNoun(3, 'entry has', 'entries have')).toBe('3 entries have');
  });
});
