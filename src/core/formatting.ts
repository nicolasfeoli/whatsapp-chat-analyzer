/**
 * Small pure helpers for durations, medians and calendar days. Shared by the
 * analysis and by the page.
 */

import {
  DAYS_PER_WEEK,
  HOURS_PER_DAY,
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_SECOND,
  MINUTES_PER_HOUR,
  SECONDS_PER_MINUTE,
} from './time-constants';

/**
 * Durations are shown in hours up to two full days ("36 h" reads better than
 * "2 days" for a day and a half); from here on they are shown in days.
 */
const HOURS_SHOWN_BEFORE_SWITCHING_TO_DAYS = 48;

/** Below ten hours one decimal is worth showing ("1.5 h"); above it is noise. */
const HOURS_SHOWN_WITH_ONE_DECIMAL = 10;

/** A duration is never shown as "0 s"; anything shorter than a second reads as one second. */
const SMALLEST_DISPLAYED_SECONDS = 1;

/** The year is multiplied by this in a sortable day number, giving the digits `YYYY0000`. */
const SORTABLE_DAY_NUMBER_YEAR_MULTIPLIER = 10000;

/** The month is multiplied by this in a sortable day number, giving the digits `MM00`. */
const SORTABLE_DAY_NUMBER_MONTH_MULTIPLIER = 100;

/**
 * `Date.prototype.getDay` numbers the week from Sunday (0) to Saturday (6).
 * Adding this before taking the remainder moves Monday to 0 and Sunday to 6,
 * the order the heatmap and the weekly timeline use.
 */
const SUNDAY_FIRST_TO_MONDAY_FIRST_SHIFT = 6;

/**
 * Writes a duration the way a person would say it: seconds below a minute,
 * minutes below an hour, hours below two days, and days after that.
 *
 * @param durationInMilliseconds - The length of time to describe.
 * @returns For example `"45 s"`, `"12 min"`, `"1.5 h"`, `"36 h"` or `"9 days"`.
 */
export function formatDuration(durationInMilliseconds: number): string {
  const seconds = durationInMilliseconds / MILLISECONDS_PER_SECOND;
  if (seconds < SECONDS_PER_MINUTE) {
    const wholeSeconds = Math.max(SMALLEST_DISPLAYED_SECONDS, Math.round(seconds));
    return `${wholeSeconds} s`;
  }

  const minutes = seconds / SECONDS_PER_MINUTE;
  if (minutes < MINUTES_PER_HOUR) {
    return `${Math.round(minutes)} min`;
  }

  const hours = minutes / MINUTES_PER_HOUR;
  if (hours < HOURS_SHOWN_WITH_ONE_DECIMAL) {
    return `${hours.toFixed(1)} h`;
  }
  if (hours < HOURS_SHOWN_BEFORE_SWITCHING_TO_DAYS) {
    return `${Math.round(hours)} h`;
  }

  const days = hours / HOURS_PER_DAY;
  return `${Math.round(days)} days`;
}

/**
 * The middle value of a list of numbers; the mean of the two middle values
 * when the list has an even length. The input is not modified.
 *
 * @param values - The numbers, in any order.
 * @returns The median, or `null` for an empty list.
 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sortedValues = [...values].sort((firstValue, secondValue) => firstValue - secondValue);
  const upperMiddleIndex = Math.floor(sortedValues.length / 2);
  const upperMiddleValue = sortedValues[upperMiddleIndex];
  if (upperMiddleValue === undefined) {
    return null;
  }

  const hasOddLength = sortedValues.length % 2 === 1;
  if (hasOddLength) {
    return upperMiddleValue;
  }

  const lowerMiddleValue = sortedValues[upperMiddleIndex - 1];
  if (lowerMiddleValue === undefined) {
    return upperMiddleValue;
  }
  return (lowerMiddleValue + upperMiddleValue) / 2;
}

/**
 * Midnight at the start of the calendar day a moment falls on, in local time.
 *
 * @param moment - Any moment.
 * @returns A new `Date` at 00:00:00.000 of the same day.
 */
export function startOfDay(moment: Date): Date {
  return new Date(moment.getFullYear(), moment.getMonth(), moment.getDate());
}

/**
 * Packs a year, a month and a day into one number whose digits read
 * `YYYYMMDD`, e.g. 13 January 2024 becomes `20240113`. Such numbers make cheap
 * map keys and sort chronologically. The parts are not validated: the date
 * order detection feeds it numbers whose meaning is still being worked out.
 *
 * @param year - The year, with its century.
 * @param monthNumber - The month, 1 for January up to 12 for December.
 * @param dayOfMonth - The day of the month, starting at 1.
 * @returns The three parts as one number.
 */
export function sortableDayNumber(year: number, monthNumber: number, dayOfMonth: number): number {
  const yearPart = year * SORTABLE_DAY_NUMBER_YEAR_MULTIPLIER;
  const monthPart = monthNumber * SORTABLE_DAY_NUMBER_MONTH_MULTIPLIER;
  return yearPart + monthPart + dayOfMonth;
}

/**
 * Writes a calendar day as the number `YYYYMMDD`, e.g. 13 January 2024 becomes
 * `20240113`. Numbers make cheap map keys and sort chronologically.
 *
 * @param moment - Any moment of the day.
 * @returns The day key in local time.
 */
export function dayKeyFromDate(moment: Date): number {
  return sortableDayNumber(moment.getFullYear(), moment.getMonth() + 1, moment.getDate());
}

/**
 * The inverse of {@link dayKeyFromDate}.
 *
 * @param dayKey - A day written as the number `YYYYMMDD`.
 * @returns Midnight at the start of that day, in local time.
 */
export function dateFromDayKey(dayKey: number): Date {
  const year = Math.floor(dayKey / SORTABLE_DAY_NUMBER_YEAR_MULTIPLIER);
  const monthNumber =
    Math.floor(dayKey / SORTABLE_DAY_NUMBER_MONTH_MULTIPLIER) %
    SORTABLE_DAY_NUMBER_MONTH_MULTIPLIER;
  const dayOfMonth = dayKey % SORTABLE_DAY_NUMBER_MONTH_MULTIPLIER;
  return new Date(year, monthNumber - 1, dayOfMonth);
}

/**
 * The position of a moment's weekday in a week that starts on Monday, which is
 * the order of the rows of the heatmap.
 *
 * @param moment - Any moment.
 * @returns 0 for Monday up to 6 for Sunday, in local time.
 */
export function mondayFirstWeekdayIndexOf(moment: Date): number {
  return (moment.getDay() + SUNDAY_FIRST_TO_MONDAY_FIRST_SHIFT) % DAYS_PER_WEEK;
}

/**
 * How many calendar days lie between two midnights. Rounded, because a day in
 * which the clocks change is twenty-three or twenty-five hours long.
 *
 * @param earlierMidnight - Midnight at the start of the earlier day.
 * @param laterMidnight - Midnight at the start of the later day.
 * @returns The number of days from the first to the second; negative when they are swapped.
 */
export function calendarDaysBetween(earlierMidnight: Date, laterMidnight: Date): number {
  const differenceInMilliseconds = laterMidnight.getTime() - earlierMidnight.getTime();
  return Math.round(differenceInMilliseconds / MILLISECONDS_PER_DAY);
}
