/**
 * The period of a chat the report is drawn for: the ready-made choices
 * ("Last 12 months", one per calendar year), the dates typed into the two
 * date fields, and the analysis of just the messages of a period.
 *
 * Everything here is a pure function without the DOM. A period is a pair of
 * local calendar days and includes both of them. The days are written as day
 * keys, the numbers `YYYYMMDD` the analysis already uses, so two periods can
 * be compared with `===` and a message is placed by one comparison.
 */

import { analyseChat, dateFromDayKey, dayKeyFromDate, sortableDayNumber } from '../core/index';
import type { ChatAnalysis, ChatMessage, GroupEvent } from '../core/index';
import { formatLongDate, padToTwoDigits } from './text-formatting';

/** A stretch of local calendar days, both ends included. */
export interface Period {
  /** The first day, written as the number `YYYYMMDD`. */
  readonly firstDayKey: number;
  /** The last day, written as the number `YYYYMMDD`. Never before the first. */
  readonly lastDayKey: number;
}

/** One ready-made choice of the period list. */
export interface PeriodPreset {
  /** What identifies the choice in the list, e.g. `whole-chat` or `year-2023`. */
  readonly value: string;
  /** What the reader sees, e.g. "The whole chat" or "2023". */
  readonly label: string;
  /** The days the choice stands for, never reaching beyond the chat. */
  readonly period: Period;
}

/** The dates of the two date fields, read as a period of the chat. */
export interface ReadablePeriodReading {
  readonly kind: 'period';
  /** The days between the two dates, cut down to the days of the chat. */
  readonly period: Period;
}

/** The two date fields hold dates that no report can be drawn for. */
export interface UnusablePeriodReading {
  readonly kind: 'unusable';
  /** Why, in a sentence fit for the status line. */
  readonly reason: string;
}

/** What the two date fields amount to. Discriminated by `kind`. */
export type PeriodReading = ReadablePeriodReading | UnusablePeriodReading;

/** The value of the choice that stands for every message of the chat. */
export const WHOLE_CHAT_PRESET_VALUE = 'whole-chat';

/** The value of the choice that stands for the twelve months up to the last message. */
export const LAST_TWELVE_MONTHS_PRESET_VALUE = 'last-12-months';

/**
 * The value of the entry the list shows when the dates were typed by hand and
 * match none of the ready-made choices.
 */
export const CUSTOM_PERIOD_VALUE = 'custom';

/** The label of the entry for dates typed by hand. */
export const CUSTOM_PERIOD_LABEL = 'Custom range';

/** In front of a year, the value of the choice for that calendar year: `year-2023`. */
const YEAR_PRESET_VALUE_PREFIX = 'year-';

/** Shown when the "from" date is later than the "to" date. */
export const PERIOD_ENDS_BEFORE_IT_STARTS_STATUS =
  'The "from" date is after the "to" date. The report still shows the period it showed before.';

/** Shown when nobody wrote on any day between the two dates. */
export const NO_MESSAGES_IN_PERIOD_STATUS =
  'No messages between those dates. The report still shows the period it showed before.';

/**
 * A chat shorter than this, and without a ready-made period besides the whole
 * chat, is not offered the choice at all: two months is the span at which
 * "then and now" starts comparing, and below it a part of the chat is a few
 * weeks in which most numbers are chance.
 */
export const SHORTEST_SPAN_WORTH_FILTERING_IN_DAYS = 60;

/** A date field writes its day as `YYYY-MM-DD`; the groups are the three numbers. */
const DATE_FIELD_VALUE_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/;

/** A date field writes the year with this many digits ("0987", "2024"). */
const DATE_FIELD_YEAR_DIGIT_COUNT = 4;

/** The month number of January, in which a calendar year starts. */
const FIRST_MONTH_NUMBER = 1;

/** The month number of December, in which a calendar year ends. */
const LAST_MONTH_NUMBER = 12;

/** The last day of December. */
const LAST_DAY_OF_DECEMBER = 31;

/**
 * The period that holds every message of a chat.
 *
 * @param analysis - The analysed chat.
 * @returns The day of its first message to the day of its last.
 */
export function wholeChatPeriod(analysis: ChatAnalysis): Period {
  return {
    firstDayKey: dayKeyFromDate(analysis.firstMessageTimestamp),
    lastDayKey: dayKeyFromDate(analysis.lastMessageTimestamp),
  };
}

/**
 * Tells whether two periods cover the same days.
 *
 * @param firstPeriod - One period.
 * @param secondPeriod - Another.
 * @returns `true` when both start and end on the same days.
 */
export function isSamePeriod(firstPeriod: Period, secondPeriod: Period): boolean {
  return (
    firstPeriod.firstDayKey === secondPeriod.firstDayKey &&
    firstPeriod.lastDayKey === secondPeriod.lastDayKey
  );
}

/**
 * Cuts a period down to the days of the chat.
 *
 * @param period - Any period.
 * @param wholeChat - The period of the whole chat.
 * @returns The days both have in common, or `null` when they have none.
 */
function limitPeriodToChat(period: Period, wholeChat: Period): Period | null {
  const firstDayKey = Math.max(period.firstDayKey, wholeChat.firstDayKey);
  const lastDayKey = Math.min(period.lastDayKey, wholeChat.lastDayKey);
  return firstDayKey > lastDayKey ? null : { firstDayKey, lastDayKey };
}

/**
 * The first day of the twelve months that end on a given day: the day after
 * the same date one year earlier, so 15 March 2024 gives 16 March 2023 and
 * the period is exactly one year long.
 *
 * @param lastDay - Midnight at the start of the last day of the period.
 * @returns The day key of the first day.
 */
function firstDayKeyOfTwelveMonthsEndingOn(lastDay: Date): number {
  const sameDateOneYearEarlier = new Date(
    lastDay.getFullYear() - 1,
    lastDay.getMonth(),
    lastDay.getDate(),
  );
  /* 29 February has no counterpart a year earlier; the calendar answers 1 March, which already is the day after. */
  const hasRolledIntoNextMonth = sameDateOneYearEarlier.getMonth() !== lastDay.getMonth();
  if (!hasRolledIntoNextMonth) {
    sameDateOneYearEarlier.setDate(sameDateOneYearEarlier.getDate() + 1);
  }
  return dayKeyFromDate(sameDateOneYearEarlier);
}

/**
 * Lists the calendar years in which at least one message was sent, oldest first.
 */
function listYearsWithMessages(analysis: ChatAnalysis): number[] {
  const years = new Set<number>();
  for (const dayKey of analysis.messageCountsByDayKey.keys()) {
    years.add(dateFromDayKey(dayKey).getFullYear());
  }
  return [...years].sort((firstYear, secondYear) => firstYear - secondYear);
}

/**
 * The period of one calendar year: 1 January to 31 December.
 */
function calendarYearPeriod(year: number): Period {
  return {
    firstDayKey: sortableDayNumber(year, FIRST_MONTH_NUMBER, 1),
    lastDayKey: sortableDayNumber(year, LAST_MONTH_NUMBER, LAST_DAY_OF_DECEMBER),
  };
}

/**
 * Lists the ready-made periods of a chat, in the order the list shows them:
 * the whole chat, the last twelve months when the chat is longer than that,
 * and every calendar year with messages when there is more than one. Every
 * period is cut down to the days of the chat and holds at least one message.
 *
 * @param analysis - The analysis of the whole chat.
 * @returns The choices; the first is always the whole chat.
 */
export function listPeriodPresets(analysis: ChatAnalysis): PeriodPreset[] {
  const wholeChat = wholeChatPeriod(analysis);
  const presets: PeriodPreset[] = [
    { value: WHOLE_CHAT_PRESET_VALUE, label: 'The whole chat', period: wholeChat },
  ];

  const lastDay = dateFromDayKey(wholeChat.lastDayKey);
  const firstDayKeyOfLastTwelveMonths = firstDayKeyOfTwelveMonthsEndingOn(lastDay);
  if (firstDayKeyOfLastTwelveMonths > wholeChat.firstDayKey) {
    presets.push({
      value: LAST_TWELVE_MONTHS_PRESET_VALUE,
      label: 'Last 12 months',
      period: { firstDayKey: firstDayKeyOfLastTwelveMonths, lastDayKey: wholeChat.lastDayKey },
    });
  }

  const years = listYearsWithMessages(analysis);
  if (years.length > 1) {
    for (const year of years) {
      const period = limitPeriodToChat(calendarYearPeriod(year), wholeChat);
      if (period !== null) {
        presets.push({ value: `${YEAR_PRESET_VALUE_PREFIX}${year}`, label: String(year), period });
      }
    }
  }
  return presets;
}

/**
 * Tells whether a chat is worth offering a choice of period for: it has a
 * ready-made period besides the whole chat, or it spans at least
 * {@link SHORTEST_SPAN_WORTH_FILTERING_IN_DAYS} days.
 *
 * @param analysis - The analysis of the whole chat.
 * @param presets - Its ready-made periods, from {@link listPeriodPresets}.
 * @returns `true` when the page should show the period row.
 */
export function isPeriodChoiceWorthOffering(
  analysis: ChatAnalysis,
  presets: readonly PeriodPreset[],
): boolean {
  return presets.length > 1 || analysis.spanInDays >= SHORTEST_SPAN_WORTH_FILTERING_IN_DAYS;
}

/**
 * Finds the ready-made choice that stands for exactly these days.
 *
 * @param presets - The ready-made periods of the chat.
 * @param period - The period to look for.
 * @returns The first choice with that period, or `undefined` when the dates match none.
 */
export function findPresetOfPeriod(
  presets: readonly PeriodPreset[],
  period: Period,
): PeriodPreset | undefined {
  return presets.find((preset: PeriodPreset): boolean => isSamePeriod(preset.period, period));
}

/**
 * Writes a day the way an `<input type="date">` holds it.
 *
 * @param dayKey - A day written as the number `YYYYMMDD`.
 * @returns For example `"2023-03-14"`.
 */
export function dateFieldValueOfDayKey(dayKey: number): string {
  const day = dateFromDayKey(dayKey);
  const year = String(day.getFullYear()).padStart(DATE_FIELD_YEAR_DIGIT_COUNT, '0');
  return `${year}-${padToTwoDigits(day.getMonth() + 1)}-${padToTwoDigits(day.getDate())}`;
}

/**
 * Reads the value of an `<input type="date">`.
 *
 * @param dateFieldValue - What the field holds: `YYYY-MM-DD`, or an empty
 *   string while the date is missing or incomplete.
 * @returns The day as the number `YYYYMMDD`, or `null` when the field holds no
 *   day of the calendar.
 */
export function dayKeyOfDateFieldValue(dateFieldValue: string): number | null {
  const groups = DATE_FIELD_VALUE_PATTERN.exec(dateFieldValue)?.groups;
  if (groups === undefined) {
    return null;
  }
  const year = Number(groups['year']);
  const monthNumber = Number(groups['month']);
  const dayOfMonth = Number(groups['day']);
  const day = new Date(year, monthNumber - 1, dayOfMonth);
  /* `new Date` reads the years 0 to 99 as 1900 to 1999, which no chat needs told apart. */
  day.setFullYear(year);
  /* The calendar turns 31 February into 3 March; a day that does not survive the round trip does not exist. */
  const isRealDay = day.getMonth() === monthNumber - 1 && day.getDate() === dayOfMonth;
  return isRealDay ? dayKeyFromDate(day) : null;
}

/**
 * Reads the two date fields as a period of the chat. An empty field stands
 * for the end of the chat on its side, and dates beyond the chat are pulled
 * back to its first and last day.
 *
 * @param fromFieldValue - What the "from" field holds.
 * @param toFieldValue - What the "to" field holds.
 * @param wholeChat - The period of the whole chat.
 * @returns The period, or the reason the dates cannot be used: "from" is
 *   after "to", or both lie on the same side outside the chat.
 */
export function readPeriodFromDateFields(
  fromFieldValue: string,
  toFieldValue: string,
  wholeChat: Period,
): PeriodReading {
  const firstDayKey = dayKeyOfDateFieldValue(fromFieldValue) ?? wholeChat.firstDayKey;
  const lastDayKey = dayKeyOfDateFieldValue(toFieldValue) ?? wholeChat.lastDayKey;
  if (firstDayKey > lastDayKey) {
    return { kind: 'unusable', reason: PERIOD_ENDS_BEFORE_IT_STARTS_STATUS };
  }
  const period = limitPeriodToChat({ firstDayKey, lastDayKey }, wholeChat);
  if (period === null) {
    return { kind: 'unusable', reason: NO_MESSAGES_IN_PERIOD_STATUS };
  }
  return { kind: 'period', period };
}

/**
 * Picks the messages sent on the days of a period.
 *
 * @param messages - Any messages.
 * @param period - The days to keep, both ends included, in local time.
 * @returns The messages of those days, in the order they came in.
 */
export function selectMessagesOfPeriod(
  messages: readonly ChatMessage[],
  period: Period,
): ChatMessage[] {
  return messages.filter((message: ChatMessage): boolean => {
    const dayKey = dayKeyFromDate(message.timestamp);
    return dayKey >= period.firstDayKey && dayKey <= period.lastDayKey;
  });
}

/**
 * Picks the group events dated on the days of a period.
 *
 * @param groupEvents - Any group events.
 * @param period - The days to keep, both ends included, in local time.
 * @returns The events of those days, in the order they came in.
 */
export function selectGroupEventsOfPeriod(
  groupEvents: readonly GroupEvent[],
  period: Period,
): GroupEvent[] {
  return groupEvents.filter((groupEvent: GroupEvent): boolean => {
    const dayKey = dayKeyFromDate(groupEvent.timestamp);
    return dayKey >= period.firstDayKey && dayKey <= period.lastDayKey;
  });
}

/**
 * Analyses the part of a chat that falls in a period, as if the export held
 * nothing else: every number, record and comparison is counted again from the
 * messages of those days.
 *
 * @param analysis - The analysis of the whole chat, which carries its messages.
 * @param period - The days to analyse.
 * @returns The analysis of those days; the analysis handed in when the period
 *   covers the whole chat; `null` when no message was sent in the period.
 */
export function analysePeriod(analysis: ChatAnalysis, period: Period): ChatAnalysis | null {
  if (isSamePeriod(period, wholeChatPeriod(analysis))) {
    return analysis;
  }
  const messagesOfPeriod = selectMessagesOfPeriod(analysis.messages, period);
  if (messagesOfPeriod.length === 0) {
    return null;
  }
  return analyseChat(
    messagesOfPeriod,
    analysis.timestampResolution,
    selectGroupEventsOfPeriod(analysis.groupEvents, period),
  );
}

/**
 * Says which part of the chat the report shows, for the note next to the
 * period fields. The line above it describes the whole file, so the note
 * states that the report does not.
 *
 * @param period - The period on display, other than the whole chat.
 * @returns For example `"Showing 14 Mar 2023 to 31 Dec 2023, not the whole chat."`.
 */
export function describePeriod(period: Period): string {
  const firstDay = formatLongDate(dateFromDayKey(period.firstDayKey));
  if (period.firstDayKey === period.lastDayKey) {
    return `Showing ${firstDay} only, not the whole chat.`;
  }
  const lastDay = formatLongDate(dateFromDayKey(period.lastDayKey));
  return `Showing ${firstDay} to ${lastDay}, not the whole chat.`;
}
