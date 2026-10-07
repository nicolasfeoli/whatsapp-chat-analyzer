/**
 * Builders for hand-made trends over time, for the tests of the page. Every
 * name is invented.
 */

import type { ChatTrends, TrendBucket } from '../../src/core/types';
import { localMidnight } from './messages';

/** The milliseconds of a minute. */
const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * Builds one bucket of the trends. Everything not stated is zero or empty.
 *
 * @param startDay - The first day of the bucket, as `YYYY-MM-DD`.
 * @param parts - The counts the test is about.
 * @returns A complete bucket.
 */
export function trendBucket(startDay: string, parts: Partial<TrendBucket> = {}): TrendBucket {
  return {
    start: localMidnight(startDay),
    messageCount: 0,
    textMessageCount: 0,
    wordCount: 0,
    mediaCount: 0,
    nightMessageCount: 0,
    messageCountsByName: new Map<string, number>(),
    typicalReplyDelaysByName: new Map<string, number>(),
    ...parts,
  };
}

/** One month of a chat between Ana and Bob, in the numbers a test of the trends cares about. */
export interface MonthOfAnaAndBob {
  /** Ana's messages in the month. */
  readonly ana: number;
  /** Bob's messages in the month. */
  readonly bob: number;
  /** Bob's typical reply time in minutes; he has none when left out. */
  readonly bobReplyMinutes?: number;
  /** The words of a typed message on average; every message of the month counts as typed. Zero when left out. */
  readonly wordsPerMessage?: number;
  /** The media messages among them; none when left out. */
  readonly media?: number;
  /** The messages sent at night among them; none when left out. */
  readonly night?: number;
}

/**
 * Builds the trends of a chat between Ana and Bob, month by month.
 *
 * @param firstMonth - The first month, as `YYYY-MM`.
 * @param months - The numbers of each month, oldest first.
 * @returns Trends by month without words or emojis to follow.
 */
export function trendsByMonth(firstMonth: string, months: readonly MonthOfAnaAndBob[]): ChatTrends {
  const [year = '2024', month = '01'] = firstMonth.split('-');
  const buckets = months.map((numbers: MonthOfAnaAndBob, index: number): TrendBucket => {
    const start = new Date(Number(year), Number(month) - 1 + index, 1);
    const messageCount = numbers.ana + numbers.bob;
    return {
      start,
      messageCount,
      textMessageCount: messageCount,
      wordCount: messageCount * (numbers.wordsPerMessage ?? 0),
      mediaCount: numbers.media ?? 0,
      nightMessageCount: numbers.night ?? 0,
      messageCountsByName: new Map([
        ['Ana', numbers.ana],
        ['Bob', numbers.bob],
      ]),
      typicalReplyDelaysByName:
        numbers.bobReplyMinutes === undefined
          ? new Map<string, number>()
          : new Map([['Bob', numbers.bobReplyMinutes * MILLISECONDS_PER_MINUTE]]),
    };
  });
  return { granularity: 'month', buckets, wordTrends: [], emojiTrends: [] };
}
