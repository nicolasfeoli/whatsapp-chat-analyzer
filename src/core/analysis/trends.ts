/**
 * How the habits of a chat moved over time: the chat is cut into buckets of
 * a month, a quarter or a year, and a few things are counted for each.
 *
 * Most of it is counted during the single walk over the messages in
 * `analyse-chat.ts`, which tells this module about each message, each typed
 * text and each reply as it meets them. Only the walk knows what a reply is,
 * so counting there keeps one definition of it. The walk is chronological,
 * which is why a bucket can be closed as soon as a later one opens: the reply
 * delays of a bucket are reduced to one median per person at that moment and
 * then let go, so what is kept grows with buckets times people, not with
 * messages.
 *
 * The words and emojis are the exception. Which five matter is only known
 * once every message has been counted, and keeping every word of every
 * bucket until then would cost buckets times vocabulary. So they get a
 * second, small pass over the messages, which only looks closely at the
 * messages that contain one of the few terms.
 */

import { median } from '../formatting';
import type { ChatMessage, ChatTrends, TermTrend, TrendBucket, TrendGranularity } from '../types';
import { analyseMessageText } from './text-statistics';

/**
 * A person needs at least this many measured replies before a typical reply
 * time is shown for them, in the whole chat and in one bucket of the trends
 * alike; the median of fewer values is mostly chance.
 */
export const MINIMUM_REPLIES_FOR_TYPICAL_DELAY = 5;

/**
 * The most buckets a chat is cut into. Beyond forty points a small chart is a
 * scribble, so a longer chat gets longer buckets.
 */
export const MOST_TREND_BUCKETS = 40;

/**
 * How many of the most used words, and of the most used emojis, are followed
 * over time. The page shows five of each; a few more are followed so that
 * five are left when "Hide names" takes the words of names out.
 */
export const TREND_TERM_COUNT = 8;

/** The months of a year. */
const MONTHS_PER_YEAR = 12;

/** The months of a quarter. */
const MONTHS_PER_QUARTER = 3;

/** One bucket while it is still being counted. */
interface MutableTrendBucket {
  readonly start: Date;
  messageCount: number;
  textMessageCount: number;
  wordCount: number;
  mediaCount: number;
  nightMessageCount: number;
  readonly messageCountsByName: Map<string, number>;
  readonly typicalReplyDelaysByName: Map<string, number>;
}

/** The trends of a chat while its messages are walked. */
export interface TrendsAccumulator {
  /** The length of time each bucket covers. */
  readonly granularity: TrendGranularity;
  /** The buckets from the first message to the last, oldest first, without gaps. */
  readonly buckets: readonly MutableTrendBucket[];
  /** The number of the first bucket on the scale of {@link trendBucketNumberOf}. */
  readonly firstBucketNumber: number;
  /** The position, in `buckets`, of the bucket the walk is in. */
  openBucketIndex: number;
  /** The reply delays of the open bucket, by the name of whoever replied. */
  openBucketReplyDelaysByName: Map<string, number[]>;
}

/**
 * Counts the calendar months from one moment to another, both months included.
 */
function countMonthsBetween(first: Date, last: Date): number {
  const years = last.getFullYear() - first.getFullYear();
  return years * MONTHS_PER_YEAR + last.getMonth() - first.getMonth() + 1;
}

/**
 * Numbers the bucket a moment falls in, so that neighbouring buckets have
 * neighbouring numbers: months since the year 0, quarters since the year 0,
 * or the year itself.
 *
 * @param moment - Any moment.
 * @param granularity - The length of time a bucket covers.
 * @returns The number of the bucket, in local time.
 */
export function trendBucketNumberOf(moment: Date, granularity: TrendGranularity): number {
  const monthNumber = moment.getFullYear() * MONTHS_PER_YEAR + moment.getMonth();
  switch (granularity) {
    case 'month':
      return monthNumber;
    case 'quarter':
      return Math.floor(monthNumber / MONTHS_PER_QUARTER);
    case 'year':
      return moment.getFullYear();
  }
}

/**
 * Finds when a bucket starts.
 *
 * @param bucketNumber - The number of the bucket, from {@link trendBucketNumberOf}.
 * @param granularity - The length of time a bucket covers.
 * @returns Local midnight of the first day of the month, the quarter or the year.
 */
export function trendBucketStartOf(bucketNumber: number, granularity: TrendGranularity): Date {
  switch (granularity) {
    case 'month':
      return new Date(
        Math.floor(bucketNumber / MONTHS_PER_YEAR),
        bucketNumber % MONTHS_PER_YEAR,
        1,
      );
    case 'quarter': {
      const monthNumber = bucketNumber * MONTHS_PER_QUARTER;
      return new Date(Math.floor(monthNumber / MONTHS_PER_YEAR), monthNumber % MONTHS_PER_YEAR, 1);
    }
    case 'year':
      return new Date(bucketNumber, 0, 1);
  }
}

/**
 * Picks the bucket length that keeps the number of points readable: months
 * for a chat of up to forty calendar months, quarters up to forty quarters
 * (ten years), years beyond.
 *
 * @param firstTimestamp - When the oldest message was sent.
 * @param lastTimestamp - When the newest message was sent.
 * @returns The length of time each bucket covers.
 */
export function chooseTrendGranularity(
  firstTimestamp: Date,
  lastTimestamp: Date,
): TrendGranularity {
  const monthCount = countMonthsBetween(firstTimestamp, lastTimestamp);
  if (monthCount <= MOST_TREND_BUCKETS) {
    return 'month';
  }
  const quarterCount =
    trendBucketNumberOf(lastTimestamp, 'quarter') -
    trendBucketNumberOf(firstTimestamp, 'quarter') +
    1;
  return quarterCount <= MOST_TREND_BUCKETS ? 'quarter' : 'year';
}

/**
 * Creates the empty buckets of a chat, from the one of its first message to
 * the one of its last.
 *
 * @param firstTimestamp - When the oldest message was sent.
 * @param lastTimestamp - When the newest message was sent.
 * @returns The trends with nothing counted yet.
 */
export function createTrendsAccumulator(
  firstTimestamp: Date,
  lastTimestamp: Date,
): TrendsAccumulator {
  const granularity = chooseTrendGranularity(firstTimestamp, lastTimestamp);
  const firstBucketNumber = trendBucketNumberOf(firstTimestamp, granularity);
  const lastBucketNumber = trendBucketNumberOf(lastTimestamp, granularity);

  const buckets: MutableTrendBucket[] = [];
  for (let bucketNumber = firstBucketNumber; bucketNumber <= lastBucketNumber; bucketNumber += 1) {
    buckets.push({
      start: trendBucketStartOf(bucketNumber, granularity),
      messageCount: 0,
      textMessageCount: 0,
      wordCount: 0,
      mediaCount: 0,
      nightMessageCount: 0,
      messageCountsByName: new Map<string, number>(),
      typicalReplyDelaysByName: new Map<string, number>(),
    });
  }
  return {
    granularity,
    buckets,
    firstBucketNumber,
    openBucketIndex: 0,
    openBucketReplyDelaysByName: new Map<string, number[]>(),
  };
}

/**
 * Reduces the reply delays of the open bucket to one typical delay per person
 * who replied often enough, and lets the delays go.
 */
function closeOpenBucket(trends: TrendsAccumulator): void {
  const openBucket = trends.buckets[trends.openBucketIndex];
  for (const [name, delays] of trends.openBucketReplyDelaysByName) {
    const typicalDelay = median(delays);
    if (
      openBucket !== undefined &&
      typicalDelay !== null &&
      delays.length >= MINIMUM_REPLIES_FOR_TYPICAL_DELAY
    ) {
      openBucket.typicalReplyDelaysByName.set(name, typicalDelay);
    }
  }
  trends.openBucketReplyDelaysByName = new Map<string, number[]>();
}

/**
 * Counts a message towards the bucket it was sent in, which becomes the open
 * bucket: everything else the walk reports about this message is counted
 * there. Messages must arrive oldest first.
 *
 * @param trends - The trends of the chat.
 * @param message - The message the walk has reached.
 */
export function countMessageInTrends(trends: TrendsAccumulator, message: ChatMessage): void {
  const bucketIndex =
    trendBucketNumberOf(message.timestamp, trends.granularity) - trends.firstBucketNumber;
  if (bucketIndex > trends.openBucketIndex && bucketIndex < trends.buckets.length) {
    closeOpenBucket(trends);
    trends.openBucketIndex = bucketIndex;
  }
  const openBucket = trends.buckets[trends.openBucketIndex];
  if (openBucket === undefined) {
    return;
  }
  openBucket.messageCount += 1;
  openBucket.messageCountsByName.set(
    message.sender,
    (openBucket.messageCountsByName.get(message.sender) ?? 0) + 1,
  );
  if (message.kind === 'media') {
    openBucket.mediaCount += 1;
  }
}

/**
 * Counts the message the walk is at as sent at night.
 *
 * @param trends - The trends of the chat.
 */
export function countNightMessageInTrends(trends: TrendsAccumulator): void {
  const openBucket = trends.buckets[trends.openBucketIndex];
  if (openBucket !== undefined) {
    openBucket.nightMessageCount += 1;
  }
}

/**
 * Counts the message the walk is at as typed text of so many words.
 *
 * @param trends - The trends of the chat.
 * @param wordCount - The words of the message, links and mentions excluded.
 */
export function countTypedMessageInTrends(trends: TrendsAccumulator, wordCount: number): void {
  const openBucket = trends.buckets[trends.openBucketIndex];
  if (openBucket !== undefined) {
    openBucket.textMessageCount += 1;
    openBucket.wordCount += wordCount;
  }
}

/**
 * Records that the message the walk is at is a reply that took so long.
 *
 * @param trends - The trends of the chat.
 * @param replierName - The name of whoever wrote the reply.
 * @param delayInMilliseconds - The time between the message before and the reply.
 */
export function recordReplyInTrends(
  trends: TrendsAccumulator,
  replierName: string,
  delayInMilliseconds: number,
): void {
  const delays = trends.openBucketReplyDelaysByName.get(replierName);
  if (delays === undefined) {
    trends.openBucketReplyDelaysByName.set(replierName, [delayInMilliseconds]);
    return;
  }
  delays.push(delayInMilliseconds);
}

/**
 * Lists the keys of a count table with the highest counts. The sort is
 * stable, so of two terms used equally often the one used first comes first.
 */
function listMostUsedTerms(counts: ReadonlyMap<string, number>, limit: number): string[] {
  return [...counts]
    .sort(([, firstCount], [, secondCount]) => secondCount - firstCount)
    .slice(0, limit)
    .map(([term]) => term);
}

/**
 * What a person typed in a message: the text of a typed message, the caption
 * of a media message, and nothing for a placeholder or a tombstone.
 */
function typedTextOf(message: ChatMessage): string {
  if (message.kind === 'text') {
    return message.text;
  }
  return message.kind === 'media' ? message.caption : '';
}

/**
 * Counts, bucket by bucket, the messages that contain each of a few words
 * and emojis.
 *
 * A message is only taken apart when its text contains one of the terms as a
 * run of characters; whether it holds the term as a whole word, or as an
 * emoji of its own, is then decided the way the word lists decide it.
 *
 * @param trends - The trends of the chat, for its buckets.
 * @param messages - The messages of the chat.
 * @param words - The words to follow, lower-cased as in the word lists.
 * @param emojis - The emojis to follow.
 * @returns One entry per word and one per emoji, in the order given.
 */
function collectTermTrends(
  trends: TrendsAccumulator,
  messages: readonly ChatMessage[],
  words: readonly string[],
  emojis: readonly string[],
): { wordTrends: TermTrend[]; emojiTrends: TermTrend[] } {
  const bucketCount = trends.buckets.length;
  const wordCountsByBucket = words.map((): number[] => new Array<number>(bucketCount).fill(0));
  const emojiCountsByBucket = emojis.map((): number[] => new Array<number>(bucketCount).fill(0));

  for (const message of messages) {
    const typedText = typedTextOf(message);
    if (typedText === '') {
      continue;
    }
    const lowerCasedText = typedText.toLowerCase();
    const mayHoldTerm =
      words.some((word: string): boolean => lowerCasedText.includes(word)) ||
      emojis.some((emoji: string): boolean => typedText.includes(emoji));
    if (!mayHoldTerm) {
      continue;
    }

    const textStatistics = analyseMessageText(typedText);
    const bucketIndex =
      trendBucketNumberOf(message.timestamp, trends.granularity) - trends.firstBucketNumber;
    for (const [wordIndex, word] of words.entries()) {
      const counts = wordCountsByBucket[wordIndex];
      if (counts !== undefined && textStatistics.significantWords.includes(word)) {
        counts[bucketIndex] = (counts[bucketIndex] ?? 0) + 1;
      }
    }
    for (const [emojiIndex, emoji] of emojis.entries()) {
      const counts = emojiCountsByBucket[emojiIndex];
      if (counts !== undefined && textStatistics.emojis.includes(emoji)) {
        counts[bucketIndex] = (counts[bucketIndex] ?? 0) + 1;
      }
    }
  }

  const toTermTrends = (terms: readonly string[], countsByBucket: number[][]): TermTrend[] =>
    terms.map((term: string, termIndex: number): TermTrend => ({
      term,
      messageCountsByBucket: countsByBucket[termIndex] ?? [],
    }));
  return {
    wordTrends: toTermTrends(words, wordCountsByBucket),
    emojiTrends: toTermTrends(emojis, emojiCountsByBucket),
  };
}

/**
 * Finishes the trends once every message has been counted: closes the last
 * bucket and follows the most used words and emojis of the chat through the
 * buckets.
 *
 * @param trends - The trends after the last message.
 * @param messages - The messages of the chat.
 * @param wordCounts - How often each significant word was used in the whole chat.
 * @param emojiCounts - How often each emoji was used in the whole chat.
 * @returns The trends as the analysis hands them out.
 */
export function completeTrends(
  trends: TrendsAccumulator,
  messages: readonly ChatMessage[],
  wordCounts: ReadonlyMap<string, number>,
  emojiCounts: ReadonlyMap<string, number>,
): ChatTrends {
  closeOpenBucket(trends);
  const buckets: readonly TrendBucket[] = trends.buckets;
  const termTrends = collectTermTrends(
    trends,
    messages,
    listMostUsedTerms(wordCounts, TREND_TERM_COUNT),
    listMostUsedTerms(emojiCounts, TREND_TERM_COUNT),
  );
  return { granularity: trends.granularity, buckets, ...termTrends };
}
