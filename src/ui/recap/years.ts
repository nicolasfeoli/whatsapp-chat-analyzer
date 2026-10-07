/**
 * Which calendar years of a chat can be told as a recap, and which of them
 * the page proposes first.
 *
 * Everything here is a pure function of the analysis of the whole chat. A
 * year is counted from the messages per day the analysis already holds, so
 * nothing is read twice.
 */

import { calendarDaysBetween, dateFromDayKey } from '../../core/index';
import type { ChatAnalysis } from '../../core/index';
import { calendarYearPeriod, limitPeriodToChat, wholeChatPeriod } from '../period';
import type { Period } from '../period';

/**
 * A year needs this many messages before a recap of it is offered. The recap
 * names a busiest month, the three people who wrote most with their shares
 * and a word of the year; below a hundred messages each of those is counted
 * in handfuls and says more about chance than about the year.
 */
export const MINIMUM_MESSAGES_FOR_RECAP = 100;

/** What the whole chat says about one calendar year. */
export interface YearSummary {
  /** The year, with its century. */
  readonly year: number;
  /** The messages sent in that year. */
  readonly messageCount: number;
  /** The days of the year that lie between the first and the last message of the chat. */
  readonly period: Period;
  /**
   * How many days {@link YearSummary.period} holds: 365 or 366 for a year the
   * chat runs through, fewer for the year it starts or ends in.
   */
  readonly coveredDayCount: number;
}

/**
 * Counts the messages of each calendar year of a chat.
 *
 * @param analysis - The analysis of the whole chat.
 * @returns One entry per year with at least one message, oldest first.
 */
export function summariseYears(analysis: ChatAnalysis): YearSummary[] {
  const messageCountsByYear = new Map<number, number>();
  for (const [dayKey, messageCount] of analysis.messageCountsByDayKey) {
    const year = dateFromDayKey(dayKey).getFullYear();
    messageCountsByYear.set(year, (messageCountsByYear.get(year) ?? 0) + messageCount);
  }

  const wholeChat = wholeChatPeriod(analysis);
  const summaries: YearSummary[] = [];
  for (const [year, messageCount] of messageCountsByYear) {
    const period = limitPeriodToChat(calendarYearPeriod(year), wholeChat);
    if (period === null) {
      continue;
    }
    const coveredDayCount =
      calendarDaysBetween(dateFromDayKey(period.firstDayKey), dateFromDayKey(period.lastDayKey)) +
      1;
    summaries.push({ year, messageCount, period, coveredDayCount });
  }
  return summaries.sort(
    (first: YearSummary, second: YearSummary): number => first.year - second.year,
  );
}

/**
 * Picks the years a recap is offered for.
 *
 * @param yearSummaries - The years of the chat, from {@link summariseYears}.
 * @returns Those with at least {@link MINIMUM_MESSAGES_FOR_RECAP} messages, in the same order.
 */
export function selectRecapYears(yearSummaries: readonly YearSummary[]): YearSummary[] {
  return yearSummaries.filter(
    (summary: YearSummary): boolean => summary.messageCount >= MINIMUM_MESSAGES_FOR_RECAP,
  );
}

/**
 * Picks the year the recap proposes first: the latest year that is over, as
 * far as the export knows, which is the latest one before the year of the
 * last message. When no such year has enough messages, the latest year that
 * has is proposed, which is then the year the export ends in.
 *
 * @param recapYears - The years a recap is offered for, oldest first.
 * @param lastMessageTimestamp - When the newest message of the chat was sent.
 * @returns The year to propose, or `null` when no year is offered.
 */
export function chooseDefaultRecapYear(
  recapYears: readonly YearSummary[],
  lastMessageTimestamp: Date,
): number | null {
  const lastYearOfChat = lastMessageTimestamp.getFullYear();
  const completeYears = recapYears.filter(
    (summary: YearSummary): boolean => summary.year < lastYearOfChat,
  );
  const proposedYear = completeYears.at(-1) ?? recapYears.at(-1);
  return proposedYear === undefined ? null : proposedYear.year;
}

/**
 * Finds the summary of one year.
 *
 * @param yearSummaries - The years of the chat.
 * @param year - The year to look for.
 * @returns Its summary, or `null` when the chat has no message in that year.
 */
export function findYearSummary(
  yearSummaries: readonly YearSummary[],
  year: number,
): YearSummary | null {
  return yearSummaries.find((summary: YearSummary): boolean => summary.year === year) ?? null;
}
