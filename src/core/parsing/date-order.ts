/**
 * Works out whether the dates of an export are day/month/year, month/day/year
 * or year/month/day.
 *
 * `03/04/24` is ambiguous on its own, and the export does not say which locale
 * wrote it. The decision is taken from the file as a whole, in this order:
 *
 * 1. A first number above 31 can only be a year: year/month/day.
 * 2. The caller forced an order (the user used the switch on the page).
 * 3. A number above 12 in the first position settles day/month; in the second
 *    position, month/day.
 * 4. Otherwise the file is read both ways and the reading in which time runs
 *    forward more consistently is kept.
 * 5. If both run forward equally well, the reading with the shorter overall
 *    span wins, because the wrong reading puts consecutive days a month apart.
 * 6. If that ties too, the region of the browser decides: month first in the
 *    United States, day first everywhere else.
 */

import { sortableDayNumber } from '../formatting';
import type { AmbiguousDateOrder, DateOrder } from '../types';

/**
 * The three numbers of a date in the order the export wrote them, before
 * anyone knows which is the day, which the month and which the year. Every
 * type that carries a date through the parser extends this one.
 */
export interface UninterpretedDate {
  /** The first number of the date: a day, a month or a year depending on the date order. */
  readonly firstDateNumber: number;
  /** The second number of the date: a month or a day. */
  readonly secondDateNumber: number;
  /** The third number of the date: a year, or a day in year-first exports. */
  readonly thirdDateNumber: number;
}

/** The outcome of {@link detectDateOrder}. */
export interface DateOrderDecision {
  /** How to read the dates of the file. */
  readonly dateOrder: DateOrder;
  /** Whether the page should say which order was chosen and offer the switch. */
  readonly isAmbiguous: boolean;
}

/** No month has more days than this, so a larger first number must be a year. */
const LARGEST_DAY_OF_MONTH = 31;

/** A number above this cannot be a month, which settles which position holds the day. */
const LARGEST_MONTH_NUMBER = 12;

/**
 * Every month is treated as 31 days long when the span of a reading is
 * estimated. Exactness does not matter: the estimate is only used to compare
 * the two readings of the same file with each other.
 */
const APPROXIMATE_DAYS_PER_MONTH = 31;

/** Twelve months of {@link APPROXIMATE_DAYS_PER_MONTH} days: the year of the same estimate. */
const APPROXIMATE_DAYS_PER_YEAR = 372;

/**
 * Matches a locale tag whose region is the United States, such as `en-US` or
 * `es-US`: the one large region that writes the month first.
 */
const UNITED_STATES_LOCALE_PATTERN = /-US$/i;

/** A date with its day and month assigned under one of the two readings. */
interface DayAndMonth {
  readonly day: number;
  readonly month: number;
}

/**
 * Assigns day and month to the first two numbers of a date under a reading.
 */
function readDayAndMonth(date: UninterpretedDate, dateOrder: AmbiguousDateOrder): DayAndMonth {
  if (dateOrder === 'dmy') {
    return { day: date.firstDateNumber, month: date.secondDateNumber };
  }
  return { day: date.secondDateNumber, month: date.firstDateNumber };
}

/**
 * Counts how often a date is earlier than the one before it when the file is
 * read in the given order. Messages are exported oldest first, so the correct
 * reading has few or no such steps back.
 */
function countStepsBackInTime(
  dates: readonly UninterpretedDate[],
  dateOrder: AmbiguousDateOrder,
): number {
  let stepsBackCount = 0;
  let previousSortableDate = -1;

  for (const date of dates) {
    const { day, month } = readDayAndMonth(date, dateOrder);
    const sortableDate = sortableDayNumber(date.thirdDateNumber, month, day);
    if (sortableDate < previousSortableDate) {
      stepsBackCount += 1;
    }
    previousSortableDate = sortableDate;
  }

  return stepsBackCount;
}

/**
 * Turns a date into an approximate count of days under a reading.
 */
function approximateDayNumber(date: UninterpretedDate, dateOrder: AmbiguousDateOrder): number {
  const { day, month } = readDayAndMonth(date, dateOrder);
  return (
    date.thirdDateNumber * APPROXIMATE_DAYS_PER_YEAR + month * APPROXIMATE_DAYS_PER_MONTH + day
  );
}

/**
 * Measures roughly how many days lie between the first and the last entry of
 * the file under a reading.
 */
function approximateSpanInDays(
  firstDate: UninterpretedDate,
  lastDate: UninterpretedDate,
  dateOrder: AmbiguousDateOrder,
): number {
  return approximateDayNumber(lastDate, dateOrder) - approximateDayNumber(firstDate, dateOrder);
}

/**
 * The date order the region of a locale writes by default.
 */
function dateOrderOfLocale(locale: string | null): AmbiguousDateOrder {
  const isUnitedStatesLocale = UNITED_STATES_LOCALE_PATTERN.test(locale ?? '');
  return isUnitedStatesLocale ? 'mdy' : 'dmy';
}

/**
 * Chooses between the two readings of a file in which no number exceeds 12.
 */
function chooseBetweenAmbiguousReadings(
  dates: readonly UninterpretedDate[],
  firstDate: UninterpretedDate,
  lastDate: UninterpretedDate,
  locale: string | null,
): AmbiguousDateOrder {
  const stepsBackAsMonthFirst = countStepsBackInTime(dates, 'mdy');
  const stepsBackAsDayFirst = countStepsBackInTime(dates, 'dmy');
  if (stepsBackAsMonthFirst < stepsBackAsDayFirst) {
    return 'mdy';
  }
  if (stepsBackAsDayFirst < stepsBackAsMonthFirst) {
    return 'dmy';
  }

  const spanAsMonthFirst = approximateSpanInDays(firstDate, lastDate, 'mdy');
  const spanAsDayFirst = approximateSpanInDays(firstDate, lastDate, 'dmy');
  if (spanAsMonthFirst < spanAsDayFirst) {
    return 'mdy';
  }
  if (spanAsDayFirst < spanAsMonthFirst) {
    return 'dmy';
  }

  return dateOrderOfLocale(locale);
}

/**
 * Finds the largest value a list of dates has in each of the first two positions.
 * Written as a loop: spreading hundreds of thousands of values into `Math.max`
 * overflows the call stack.
 */
function findLargestLeadingNumbers(dates: readonly UninterpretedDate[]): {
  readonly largestFirstNumber: number;
  readonly largestSecondNumber: number;
} {
  let largestFirstNumber = 0;
  let largestSecondNumber = 0;

  for (const date of dates) {
    if (date.firstDateNumber > largestFirstNumber) {
      largestFirstNumber = date.firstDateNumber;
    }
    if (date.secondDateNumber > largestSecondNumber) {
      largestSecondNumber = date.secondDateNumber;
    }
  }

  return { largestFirstNumber, largestSecondNumber };
}

/**
 * Decides how to read the dates of an export.
 *
 * @param dates - The dates of every message, in file order.
 * @param forcedDateOrder - The order chosen by the user, or `null` to detect it.
 * @param locale - The BCP 47 tag of the browser (`navigator.language`), used
 *   only as the last tie-break; `null` when it is not known.
 * @returns The order, and whether it is uncertain enough to tell the user;
 *   `null` when there are no dates to read.
 */
export function detectDateOrder(
  dates: readonly UninterpretedDate[],
  forcedDateOrder: AmbiguousDateOrder | null,
  locale: string | null,
): DateOrderDecision | null {
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  if (firstDate === undefined || lastDate === undefined) {
    return null;
  }

  const startsWithYear = firstDate.firstDateNumber > LARGEST_DAY_OF_MONTH;
  if (startsWithYear) {
    return { dateOrder: 'ymd', isAmbiguous: false };
  }

  if (forcedDateOrder !== null) {
    /* The user only reaches the switch for an uncertain file, so the switch must stay visible. */
    return { dateOrder: forcedDateOrder, isAmbiguous: true };
  }

  const { largestFirstNumber, largestSecondNumber } = findLargestLeadingNumbers(dates);
  if (largestFirstNumber > LARGEST_MONTH_NUMBER) {
    return { dateOrder: 'dmy', isAmbiguous: false };
  }
  if (largestSecondNumber > LARGEST_MONTH_NUMBER) {
    return { dateOrder: 'mdy', isAmbiguous: false };
  }

  const chosenDateOrder = chooseBetweenAmbiguousReadings(dates, firstDate, lastDate, locale);
  return { dateOrder: chosenDateOrder, isAmbiguous: true };
}
