/**
 * Turns the numbers of an entry's timestamp into a `Date`, and refuses the
 * ones that do not describe a real moment.
 */

import type { DateOrder } from '../types';
import type { UninterpretedDate } from './date-order';
import type { Meridiem, WrittenClockTime } from './line-pattern';

/**
 * The numbers of a timestamp as written in the export: the uninterpreted date,
 * the clock time, and the second.
 */
export interface TimestampParts extends UninterpretedDate, WrittenClockTime {
  /** The second of the minute; 0 when the export only records minutes. */
  readonly second: number;
}

/** A calendar date with each number assigned its meaning. */
interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Years written with fewer digits than this are short forms such as `24`. */
const SMALLEST_FULL_YEAR = 100;

/** WhatsApp launched in 2009, so a two-digit year always belongs to this century. */
const CENTURY_OF_TWO_DIGIT_YEARS = 2000;

/** Hours on the face of a 12-hour clock. */
const HOURS_ON_TWELVE_HOUR_CLOCK = 12;

/** The last valid hour of a day. */
const LARGEST_HOUR_OF_DAY = 23;

/** The last valid minute of an hour. */
const LARGEST_MINUTE_OF_HOUR = 59;

/**
 * Expands a two-digit year; leaves a full year alone.
 */
function expandTwoDigitYear(year: number): number {
  if (year < SMALLEST_FULL_YEAR) {
    return CENTURY_OF_TWO_DIGIT_YEARS + year;
  }
  return year;
}

/**
 * Assigns year, month and day to the three numbers of a date.
 */
function interpretDateNumbers(parts: TimestampParts, dateOrder: DateOrder): CalendarDate {
  if (dateOrder === 'ymd') {
    return {
      year: parts.firstDateNumber,
      month: parts.secondDateNumber,
      day: parts.thirdDateNumber,
    };
  }

  const year = expandTwoDigitYear(parts.thirdDateNumber);
  if (dateOrder === 'dmy') {
    return { year, month: parts.secondDateNumber, day: parts.firstDateNumber };
  }
  return { year, month: parts.firstDateNumber, day: parts.secondDateNumber };
}

/**
 * Converts an hour to the 24-hour clock. On a 12-hour clock, 12 AM is hour 0
 * and 12 PM is hour 12, which is what the remainder takes care of.
 */
function convertToTwentyFourHourClock(hour: number, meridiem: Meridiem | null): number {
  if (meridiem === 'pm') {
    return (hour % HOURS_ON_TWELVE_HOUR_CLOCK) + HOURS_ON_TWELVE_HOUR_CLOCK;
  }
  if (meridiem === 'am') {
    return hour % HOURS_ON_TWELVE_HOUR_CLOCK;
  }
  return hour;
}

/**
 * Builds the moment an entry was sent, in the local time zone.
 *
 * `new Date(2024, 1, 31)` does not fail: it silently rolls 31 February over to
 * 2 March. A date like that means the file was read in the wrong order or is
 * damaged, so anything that did not survive as written is rejected instead of
 * being placed on the wrong day.
 *
 * @param parts - The numbers of the timestamp as written.
 * @param dateOrder - How to read the three date numbers.
 * @returns The moment, or `null` when the numbers do not describe a real date and time.
 */
export function buildTimestamp(parts: TimestampParts, dateOrder: DateOrder): Date | null {
  const { year, month, day } = interpretDateNumbers(parts, dateOrder);
  const hour = convertToTwentyFourHourClock(parts.hour, parts.meridiem);
  const monthIndex = month - 1;

  const timestamp = new Date(year, monthIndex, day, hour, parts.minute, parts.second);

  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }
  if (hour > LARGEST_HOUR_OF_DAY || parts.minute > LARGEST_MINUTE_OF_HOUR) {
    return null;
  }
  if (timestamp.getMonth() !== monthIndex || timestamp.getDate() !== day) {
    return null;
  }
  return timestamp;
}
