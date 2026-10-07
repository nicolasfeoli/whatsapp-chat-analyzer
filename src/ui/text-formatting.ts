/**
 * How the page writes numbers, percentages, dates and times.
 *
 * The page is in English whatever the browser's language, so numbers always
 * use the `en-US` grouping ("12,345") and month names are fixed.
 */

/** The locale used for digit grouping, fixed so the page reads the same everywhere. */
const NUMBER_FORMATTING_LOCALE = 'en-US';

/**
 * Shares below this fraction (10%) are shown with one decimal, because "0%" or
 * "3%" hides too much when the share is small.
 */
const FRACTION_SHOWN_WITH_ONE_DECIMAL = 0.1;

/** A fraction is multiplied by this to become a percentage. */
const PERCENT_PER_WHOLE = 100;

/** Clock and calendar numbers are padded to this many digits ("07", "23"). */
const CLOCK_NUMBER_DIGIT_COUNT = 2;

/**
 * A four-digit year without its first two digits is the short form WhatsApp
 * exports and narrow axis labels use ("26" for 2026).
 */
const CENTURY_DIGIT_COUNT = 2;

/** The names of the weekdays, Monday first, matching the rows of the heatmap. */
export const WEEKDAY_NAMES: readonly string[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** Three-letter month names, January first, indexed by `Date.getMonth()`. */
export const MONTH_ABBREVIATIONS: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Rounds a number and writes it with thousands separators.
 *
 * @param value - Any finite number.
 * @returns For example `"12,345"`.
 */
export function formatWholeNumber(value: number): string {
  return Math.round(value).toLocaleString(NUMBER_FORMATTING_LOCALE);
}

/**
 * Writes a fraction as a percentage: one decimal below 10%, none from there on.
 *
 * @param fraction - A share between 0 and 1.
 * @returns For example `"4.2%"` or `"63%"`.
 */
export function formatPercentage(fraction: number): string {
  const decimalPlaces = fraction < FRACTION_SHOWN_WITH_ONE_DECIMAL ? 1 : 0;
  const percentage = fraction * PERCENT_PER_WHOLE;
  return `${percentage.toFixed(decimalPlaces)}%`;
}

/**
 * Pads a clock or calendar number with a leading zero.
 *
 * @param value - A whole number such as an hour, a minute or a day of the month.
 * @returns For example `"07"`.
 */
export function padToTwoDigits(value: number): string {
  return String(value).padStart(CLOCK_NUMBER_DIGIT_COUNT, '0');
}

/**
 * Writes the year of a moment without its century.
 *
 * @param moment - Any moment in a four-digit year.
 * @returns The last two digits of the year, for example `"26"` for 2026.
 */
export function formatTwoDigitYear(moment: Date): string {
  return String(moment.getFullYear()).slice(CENTURY_DIGIT_COUNT);
}

/**
 * The three-letter name of the month a moment falls in.
 *
 * @param moment - Any moment.
 * @returns For example `"Mar"`.
 */
export function monthAbbreviationOf(moment: Date): string {
  return MONTH_ABBREVIATIONS[moment.getMonth()] ?? '';
}

/**
 * The name of a weekday by its row in the heatmap.
 *
 * @param weekdayIndex - 0 for Monday up to 6 for Sunday.
 * @returns For example `"Wednesday"`; an empty string for an index out of range.
 */
export function weekdayNameOf(weekdayIndex: number): string {
  return WEEKDAY_NAMES[weekdayIndex] ?? '';
}

/**
 * Writes a date with its year.
 *
 * @param moment - Any moment of the day.
 * @returns For example `"5 Jan 2026"`.
 */
export function formatLongDate(moment: Date): string {
  return `${moment.getDate()} ${monthAbbreviationOf(moment)} ${moment.getFullYear()}`;
}

/**
 * Writes a date without its year, for axis labels where space is short.
 *
 * @param moment - Any moment of the day.
 * @returns For example `"5 Jan"`.
 */
export function formatShortDate(moment: Date): string {
  return `${moment.getDate()} ${monthAbbreviationOf(moment)}`;
}

/**
 * Writes the time of day on a 24 hour clock.
 *
 * @param moment - Any moment.
 * @returns For example `"08:05"`.
 */
export function formatClockTime(moment: Date): string {
  return `${padToTwoDigits(moment.getHours())}:${padToTwoDigits(moment.getMinutes())}`;
}

/**
 * Writes a date and time the way a chat bubble shows it.
 *
 * @param moment - Any moment.
 * @returns For example `"05/01/2026 08:05"` (day, month, year).
 */
export function formatBubbleTimestamp(moment: Date): string {
  const dayOfMonth = padToTwoDigits(moment.getDate());
  const monthNumber = padToTwoDigits(moment.getMonth() + 1);
  return `${dayOfMonth}/${monthNumber}/${moment.getFullYear()} ${formatClockTime(moment)}`;
}

/**
 * Writes a count followed by the right form of its noun.
 *
 * @param count - How many there are.
 * @param singular - The wording for exactly one, e.g. `"line"` or `"entry has"`.
 * @param plural - The wording for any other count, e.g. `"lines"` or `"entries have"`.
 * @returns For example `"1 line"` or `"2,340 lines"`.
 */
export function formatCountWithNoun(count: number, singular: string, plural: string): string {
  const noun = count === 1 ? singular : plural;
  return `${formatWholeNumber(count)} ${noun}`;
}
