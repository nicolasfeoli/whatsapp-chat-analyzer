/**
 * Named lengths of time, so no module has to spell out `864e5` or `3600e3`.
 * The page imports them through `core/index.ts` instead of declaring its own.
 */

/** `Date.getTime()` counts in milliseconds; durations shown to people start at seconds. */
export const MILLISECONDS_PER_SECOND = 1000;

/** Used to split a duration into minutes and seconds, and to draw a random second of a minute. */
export const SECONDS_PER_MINUTE = 60;

/** Used to split a duration into hours and minutes; also the number of minutes on a clock face. */
export const MINUTES_PER_HOUR = 60;

/** Hours in one day; also the number of columns in the weekday heatmap. */
export const HOURS_PER_DAY = 24;

/** Days in one week; also the number of rows in the weekday heatmap. */
export const DAYS_PER_WEEK = 7;

/** The unit reply delays are compared in: an Android export records nothing finer. */
export const MILLISECONDS_PER_MINUTE = SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;

/** The unit of the conversation break (8 hours) and of the reply window (12 hours). */
export const MILLISECONDS_PER_HOUR = MINUTES_PER_HOUR * MILLISECONDS_PER_MINUTE;

/**
 * Milliseconds in a day of twenty-four hours. A calendar day is an hour shorter
 * or longer when the clocks change, which is why day differences are rounded.
 */
export const MILLISECONDS_PER_DAY = HOURS_PER_DAY * MILLISECONDS_PER_HOUR;
