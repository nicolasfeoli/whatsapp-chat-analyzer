/**
 * Builders for hand-made analysis results, for the tests of the page, which
 * starts from an analysis rather than from messages.
 *
 * Each builder fills in unremarkable defaults, so a test states only the
 * numbers it is about. Every name and message is invented.
 */

import type {
  AnalysedChatExportResult,
  ChatAnalysis,
  MediaType,
  ParseReport,
  PersonStatistics,
} from '../../src/core/types';
import { localMidnight, localTime, textMessage } from './messages';

/** Rows of the weekday heatmap: Monday first, Sunday last. */
const WEEKDAY_COUNT = 7;

/** Columns of the weekday heatmap: hour 0 to hour 23. */
const HOUR_COUNT = 24;

/** The parts of a person's statistics a test cares about; `name` is always stated. */
export type PersonStatisticsParts = Partial<PersonStatistics> & Pick<PersonStatistics, 'name'>;

/**
 * Builds the statistics of one participant. Everything not stated is zero or empty.
 *
 * @param parts - The name and the numbers the test is about.
 * @returns Complete statistics for that person.
 */
export function personStatistics(parts: PersonStatisticsParts): PersonStatistics {
  return {
    messageCount: 0,
    textMessageCount: 0,
    mediaCount: 0,
    mediaCountsByType: new Map<MediaType, number>(),
    deletedCount: 0,
    wordCount: 0,
    emojiCount: 0,
    questionCount: 0,
    linkCount: 0,
    laughingMessageCount: 0,
    nightMessageCount: 0,
    replyDelaysInMilliseconds: [],
    conversationsStartedCount: 0,
    conversationsEndedCount: 0,
    unansweredQuestionCount: 0,
    replyCountsByRecipient: new Map<string, number>(),
    turnCount: 0,
    emojiCounts: new Map<string, number>(),
    wordCounts: new Map<string, number>(),
    ...parts,
  };
}

/**
 * Builds a heatmap of seven weekdays by twenty-four hours with no messages.
 *
 * @returns A grid of zeros the test may fill in.
 */
export function emptyHeatmap(): number[][] {
  return Array.from({ length: WEEKDAY_COUNT }, () => new Array<number>(HOUR_COUNT).fill(0));
}

/** One slot of the heatmap and the number of messages to put there. */
export interface HeatmapSlot {
  /** 0 for Monday up to 6 for Sunday. */
  readonly weekdayIndex: number;
  /** The hour of the day, 0 to 23. */
  readonly hour: number;
  readonly messageCount: number;
}

/**
 * Builds a heatmap that is empty except for the slots listed.
 *
 * @param slots - The slots that have messages.
 * @returns The grid.
 * @throws Error when a slot lies outside the grid.
 */
export function heatmapWith(slots: readonly HeatmapSlot[]): number[][] {
  const heatmap = emptyHeatmap();
  for (const slot of slots) {
    const weekdayRow = heatmap[slot.weekdayIndex];
    if (weekdayRow === undefined || slot.hour < 0 || slot.hour >= HOUR_COUNT) {
      throw new Error(`No heatmap slot for weekday ${slot.weekdayIndex}, hour ${slot.hour}`);
    }
    weekdayRow[slot.hour] = slot.messageCount;
  }
  return heatmap;
}

/**
 * Adds up the message counts of some people.
 */
function totalMessageCountOf(people: readonly PersonStatistics[]): number {
  let total = 0;
  for (const person of people) {
    total += person.messageCount;
  }
  return total;
}

/**
 * Builds the analysis of a small chat. Unless stated otherwise it is a single
 * Saturday, 13 January 2024, with one message from Ana, read from an export
 * that records seconds. `totalMessageCount` follows from the people given.
 *
 * @param parts - The parts the test is about.
 * @returns A complete analysis.
 */
export function chatAnalysis(parts: Partial<ChatAnalysis> = {}): ChatAnalysis {
  const people = parts.people ?? [personStatistics({ name: 'Ana', messageCount: 1 })];
  const firstMessage = textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00', text: 'hello' });

  return {
    messages: [firstMessage],
    weekdayHourHeatmap: emptyHeatmap(),
    messageCountsByDayKey: new Map<number, number>([[20240113, 1]]),
    emojiCounts: new Map<string, number>(),
    wordCounts: new Map<string, number>(),
    longestMessage: null,
    longestMessageWordCount: 0,
    longestSilence: null,
    longestStreak: {
      lengthInDays: 1,
      from: localMidnight('2024-01-13'),
      to: localMidnight('2024-01-13'),
    },
    busiestDay: { date: localMidnight('2024-01-13'), messageCount: 1 },
    firstMessageTimestamp: localTime('2024-01-13 10:00'),
    lastMessageTimestamp: localTime('2024-01-13 10:00'),
    spanInDays: 1,
    activeDayCount: 1,
    conversationCount: 1,
    totalMessageCount: totalMessageCountOf(people),
    timestampResolution: 'second',
    ...parts,
    people,
  };
}

/**
 * Builds the bookkeeping of a parse in which nothing was skipped: an iPhone
 * export of ten lines, each of them a message.
 *
 * @param parts - The counts the test is about.
 * @returns A complete parse report.
 */
export function parseReport(parts: Partial<ParseReport> = {}): ParseReport {
  return {
    nonEmptyLineCount: 10,
    entryCount: 10,
    systemNoticeCount: 0,
    unreadableDateCount: 0,
    foldedPastedLineCount: 0,
    platform: 'iPhone',
    ...parts,
  };
}

/**
 * Builds the result of analysing an export: an analysis, the date order it was
 * read in and the parse report. Unless stated otherwise the dates were read
 * day first without ambiguity.
 *
 * @param parts - The parts the test is about.
 * @returns A complete result of kind `analysed`.
 */
export function analysedResult(
  parts: Partial<Omit<AnalysedChatExportResult, 'kind'>> = {},
): AnalysedChatExportResult {
  return {
    kind: 'analysed',
    analysis: chatAnalysis(),
    dateOrder: 'dmy',
    isDateOrderAmbiguous: false,
    report: parseReport(),
    ...parts,
  };
}
