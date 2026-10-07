/**
 * The sentences under the file picker that say what was read and what was
 * skipped, so a half-understood file does not pass for a complete one.
 */

import type { AnalysedChatExportResult, DateOrder, ExportPlatform } from '../core/index';
import { formatCountWithNoun } from './text-formatting';

/**
 * When more than this share (2%) of the entries has an unreadable date, the
 * report says outright that the numbers are incomplete. Below it, a handful of
 * odd lines in a long chat does not change the picture.
 */
const UNREADABLE_DATE_SHARE_THAT_MAKES_NUMBERS_INCOMPLETE = 0.02;

/** How each date order is named to the user. */
const DATE_ORDER_DESCRIPTIONS: Readonly<Record<DateOrder, string>> = {
  dmy: 'day/month/year',
  mdy: 'month/day/year',
  ymd: 'year/month/day',
};

/** What the parse report line should show. */
export interface ParseReportSummary {
  /** Plain text for the report line; set it with `textContent`. */
  readonly text: string;
  /** Whether the line should be styled as a warning because dates could not be read. */
  readonly isWarning: boolean;
}

/**
 * Names a date order in words.
 *
 * @param dateOrder - The order of the three numbers in a date.
 * @returns For example `"day/month/year"`.
 */
export function describeDateOrder(dateOrder: DateOrder): string {
  return DATE_ORDER_DESCRIPTIONS[dateOrder];
}

/**
 * Names the kind of export, with its article.
 */
function describePlatform(platform: ExportPlatform | null): string {
  if (platform === null) {
    return 'a WhatsApp';
  }
  return `an ${platform}`;
}

/**
 * Describes how many entries had an unreadable date, and how much that matters.
 */
function describeUnreadableDates(unreadableDateCount: number, entryCount: number): string {
  const subject = formatCountWithNoun(unreadableDateCount, 'entry has', 'entries have');
  const isLargeShare =
    unreadableDateCount > entryCount * UNREADABLE_DATE_SHARE_THAT_MAKES_NUMBERS_INCOMPLETE;
  const ending = isLargeShare ? ', so the numbers below are incomplete.' : '.';
  return ` ${subject} a date that could not be read${ending}`;
}

/**
 * Writes the parse report for a successfully analysed export.
 *
 * The system notices are split in two: those kept as events of the group
 * history and those skipped. Together they are the report's count of notices.
 *
 * @param result - The analysis together with the parser's own bookkeeping.
 * @returns The text of the report line and whether it is a warning.
 */
export function summariseParseReport(result: AnalysedChatExportResult): ParseReportSummary {
  const { report } = result;
  const messages = formatCountWithNoun(result.analysis.totalMessageCount, 'message', 'messages');
  const lines = formatCountWithNoun(report.nonEmptyLineCount, 'line', 'lines');
  const platform = describePlatform(report.platform);
  const dateOrder = describeDateOrder(result.dateOrder);

  let text = `Read ${messages} from ${lines} of ${platform} export, dates as ${dateOrder}.`;

  const groupEventCount = result.analysis.groupEvents.length;
  if (groupEventCount > 0) {
    const groupEvents = formatCountWithNoun(groupEventCount, 'system notice', 'system notices');
    text += ` Kept ${groupEvents} as group history.`;
  }

  const skippedNoticeCount = report.systemNoticeCount - groupEventCount;
  if (skippedNoticeCount > 0) {
    const notices = formatCountWithNoun(skippedNoticeCount, 'system notice', 'system notices');
    text += ` Skipped ${notices}.`;
  }

  if (report.foldedPastedLineCount > 0) {
    const pastedLines = formatCountWithNoun(
      report.foldedPastedLineCount,
      'pasted line was',
      'pasted lines were',
    );
    text += ` ${pastedLines} kept as part of the message quoting them.`;
  }

  const hasUnreadableDates = report.unreadableDateCount > 0;
  if (hasUnreadableDates) {
    text += describeUnreadableDates(report.unreadableDateCount, report.entryCount);
  }

  return { text, isWarning: hasUnreadableDates };
}

/**
 * Writes the hint shown next to the "Switch" button when the dates of a file
 * can be read both as day/month and as month/day.
 *
 * @param dateOrder - The order the dates are currently read in.
 * @returns The hint as plain text.
 */
export function describeAmbiguousDateOrder(dateOrder: DateOrder): string {
  return `Dates in this file could be read two ways. Reading them as ${describeDateOrder(dateOrder)}. If the timeline looks wrong:`;
}
