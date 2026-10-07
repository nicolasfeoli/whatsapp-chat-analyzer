/**
 * Groups the messages of a chat into the bars of the timeline.
 *
 * A chat of three weeks is drawn day by day and a chat of ten years is drawn
 * year by year, so the number of bars stays readable. Each bar ("bucket") is
 * split by person ("series"). Everything here is pure data preparation; the
 * drawing lives in `timeline.ts`.
 */

import { DAYS_PER_WEEK, mondayFirstWeekdayIndexOf, startOfDay } from '../../core/index';
import type { ChatAnalysis, ChatMessage, PersonStatistics } from '../../core/index';
import {
  COLOURED_PEOPLE_LIMIT,
  OTHER_PEOPLE_COLOUR,
  colourOfPerson,
  selectColouredPeople,
} from '../person-colours';
import type { PersonColours } from '../person-colours';
import {
  formatLongDate,
  formatShortDate,
  formatTwoDigitYear,
  monthAbbreviationOf,
} from '../text-formatting';

/** The length of time one bar of the timeline covers. */
export type TimelineGranularity = 'day' | 'week' | 'month' | 'year';

/** Up to a month and a half, one bar per day is still at most 46 bars. */
const LONGEST_SPAN_SHOWN_BY_DAY_IN_DAYS = 45;

/** Up to about fourteen months, one bar per week is at most 60 bars. */
const LONGEST_SPAN_SHOWN_BY_WEEK_IN_DAYS = 420;

/** Up to eight years, one bar per month is at most 96 bars; beyond that, one per year. */
const LONGEST_SPAN_SHOWN_BY_MONTH_IN_DAYS = 365 * 8;

/** The label of the series that gathers everyone beyond the coloured people. */
const OTHERS_SERIES_LABEL = 'Others';

/** One stacked layer of the timeline: a person, or everybody else together. */
export interface TimelineSeries {
  /** The person's name, or "Others". Untrusted; escape before placing in markup. */
  readonly label: string;
  /** The CSS colour of the layer. */
  readonly colour: string;
}

/** One bar of the timeline. */
export interface TimelineBucket {
  /** The first moment the bar covers: midnight of the day, Monday, first of the month or year. */
  readonly start: Date;
  /** Messages per series, in the order of {@link TimelineData.series}. */
  readonly messageCountsBySeries: readonly number[];
  /** All messages in the bar. */
  readonly totalMessageCount: number;
}

/** Everything needed to draw the timeline at any width. */
export interface TimelineData {
  readonly granularity: TimelineGranularity;
  readonly series: readonly TimelineSeries[];
  /** The bars, oldest first, with no gaps: a period without messages is an empty bar. */
  readonly buckets: readonly TimelineBucket[];
}

/** A bucket while its counts are still being added up. */
interface MutableTimelineBucket {
  /** The first moment the bar covers. */
  readonly start: Date;
  /** Messages per series so far. */
  readonly messageCountsBySeries: number[];
  /** All messages in the bar so far. */
  totalMessageCount: number;
}

/**
 * The lookup tables that say which bucket and which series a message is
 * counted in, built once before the messages are walked.
 */
interface TimelineIndex {
  /** The length of time each bucket covers. */
  readonly granularity: TimelineGranularity;
  /** The buckets, oldest first, still open for counting. */
  readonly buckets: readonly MutableTimelineBucket[];
  /** The position of each bucket in {@link TimelineIndex.buckets}, by the time its period starts. */
  readonly bucketIndexByStartTime: ReadonlyMap<number, number>;
  /** The series of each person who has one of their own, by name. */
  readonly seriesIndexByName: ReadonlyMap<string, number>;
  /** The series that counts everyone without one of their own: the last one, "Others". */
  readonly othersSeriesIndex: number;
}

/**
 * Picks the bar length that keeps the number of bars readable.
 *
 * @param spanInDays - Days from the first to the last message, inclusive.
 * @returns The length of time each bar should cover.
 */
export function chooseTimelineGranularity(spanInDays: number): TimelineGranularity {
  if (spanInDays > LONGEST_SPAN_SHOWN_BY_MONTH_IN_DAYS) {
    return 'year';
  }
  if (spanInDays > LONGEST_SPAN_SHOWN_BY_WEEK_IN_DAYS) {
    return 'month';
  }
  if (spanInDays > LONGEST_SPAN_SHOWN_BY_DAY_IN_DAYS) {
    return 'week';
  }
  return 'day';
}

/**
 * Finds the Monday that starts the week a moment falls in.
 */
function startOfWeek(moment: Date): Date {
  const monday = startOfDay(moment);
  const daysSinceMonday = mondayFirstWeekdayIndexOf(monday);
  monday.setDate(monday.getDate() - daysSinceMonday);
  return monday;
}

/**
 * Finds the start of the bucket a moment falls in.
 *
 * @param moment - Any moment.
 * @param granularity - The length of time a bucket covers.
 * @returns Local midnight of the day, of the Monday, of the first of the month
 *   or of the first of January.
 */
export function floorToBucketStart(moment: Date, granularity: TimelineGranularity): Date {
  switch (granularity) {
    case 'day':
      return startOfDay(moment);
    case 'week':
      return startOfWeek(moment);
    case 'month':
      return new Date(moment.getFullYear(), moment.getMonth(), 1);
    case 'year':
      return new Date(moment.getFullYear(), 0, 1);
  }
}

/**
 * Steps from the start of one bucket to the start of the next. Calendar
 * arithmetic is used instead of adding milliseconds, so a day in which the
 * clocks change does not shift every later bucket by an hour.
 *
 * @param bucketStart - The start of a bucket.
 * @param granularity - The length of time a bucket covers.
 * @returns The start of the following bucket, as a new `Date`.
 */
export function nextBucketStart(bucketStart: Date, granularity: TimelineGranularity): Date {
  const following = new Date(bucketStart);
  switch (granularity) {
    case 'day':
      following.setDate(following.getDate() + 1);
      break;
    case 'week':
      following.setDate(following.getDate() + DAYS_PER_WEEK);
      break;
    case 'month':
      following.setMonth(following.getMonth() + 1);
      break;
    case 'year':
      following.setFullYear(following.getFullYear() + 1);
      break;
  }
  return following;
}

/**
 * Lists the stacked layers: one per coloured person, plus "Others" when the
 * chat has more people than colours.
 */
function buildTimelineSeries(
  people: readonly PersonStatistics[],
  personColours: PersonColours,
): TimelineSeries[] {
  const series: TimelineSeries[] = selectColouredPeople(people).map(
    (person: PersonStatistics): TimelineSeries => ({
      label: person.name,
      colour: colourOfPerson(personColours, person.name),
    }),
  );

  const hasMorePeopleThanColours = people.length > COLOURED_PEOPLE_LIMIT;
  if (hasMorePeopleThanColours) {
    series.push({ label: OTHERS_SERIES_LABEL, colour: OTHER_PEOPLE_COLOUR });
  }
  return series;
}

/**
 * Creates one empty bucket for every period between the first and the last
 * message, so quiet periods show up as gaps in the chart.
 */
function createEmptyBuckets(
  firstMessageTimestamp: Date,
  lastMessageTimestamp: Date,
  granularity: TimelineGranularity,
  seriesCount: number,
): MutableTimelineBucket[] {
  const buckets: MutableTimelineBucket[] = [];
  const lastBucketStart = floorToBucketStart(lastMessageTimestamp, granularity);
  let bucketStart = floorToBucketStart(firstMessageTimestamp, granularity);

  while (bucketStart.getTime() <= lastBucketStart.getTime()) {
    buckets.push({
      start: bucketStart,
      messageCountsBySeries: new Array<number>(seriesCount).fill(0),
      totalMessageCount: 0,
    });
    bucketStart = nextBucketStart(bucketStart, granularity);
  }
  return buckets;
}

/**
 * Builds the lookup tables for counting messages into buckets and series.
 *
 * @param granularity - The length of time each bucket covers.
 * @param buckets - The empty buckets, oldest first.
 * @param people - Everyone in the chat, most messages first.
 * @param seriesCount - How many series the timeline has, "Others" included.
 */
function createTimelineIndex(
  granularity: TimelineGranularity,
  buckets: readonly MutableTimelineBucket[],
  people: readonly PersonStatistics[],
  seriesCount: number,
): TimelineIndex {
  const bucketIndexByStartTime = new Map<number, number>();
  for (const [bucketIndex, bucket] of buckets.entries()) {
    bucketIndexByStartTime.set(bucket.start.getTime(), bucketIndex);
  }

  const seriesIndexByName = new Map<string, number>();
  for (const [seriesIndex, person] of selectColouredPeople(people).entries()) {
    seriesIndexByName.set(person.name, seriesIndex);
  }

  return {
    granularity,
    buckets,
    bucketIndexByStartTime,
    seriesIndexByName,
    othersSeriesIndex: seriesCount - 1,
  };
}

/**
 * Adds one message to the bucket and series it belongs to.
 */
function countMessage(message: ChatMessage, timelineIndex: TimelineIndex): void {
  const bucketStart = floorToBucketStart(message.timestamp, timelineIndex.granularity);
  const bucketIndex = timelineIndex.bucketIndexByStartTime.get(bucketStart.getTime());
  if (bucketIndex === undefined) {
    /* Cannot happen for a sorted chat; guards against a clock-change edge leaving a hole. */
    return;
  }
  const bucket = timelineIndex.buckets[bucketIndex];
  if (bucket === undefined) {
    return;
  }

  /* Anyone without a series of their own is counted in the last one, "Others". */
  const seriesIndex =
    timelineIndex.seriesIndexByName.get(message.sender) ?? timelineIndex.othersSeriesIndex;
  const countSoFar = bucket.messageCountsBySeries[seriesIndex] ?? 0;
  bucket.messageCountsBySeries[seriesIndex] = countSoFar + 1;
  bucket.totalMessageCount += 1;
}

/**
 * Groups the messages of a chat into timeline buckets, split by person.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @returns The series and buckets of the timeline.
 */
export function buildTimelineData(
  analysis: ChatAnalysis,
  personColours: PersonColours,
): TimelineData {
  const granularity = chooseTimelineGranularity(analysis.spanInDays);
  const series = buildTimelineSeries(analysis.people, personColours);
  const buckets = createEmptyBuckets(
    analysis.firstMessageTimestamp,
    analysis.lastMessageTimestamp,
    granularity,
    series.length,
  );

  const timelineIndex = createTimelineIndex(granularity, buckets, analysis.people, series.length);
  for (const message of analysis.messages) {
    countMessage(message, timelineIndex);
  }

  return { granularity, series, buckets };
}

/**
 * The short label written under a bar on the horizontal axis.
 *
 * @param bucketStart - The start of the bucket.
 * @param granularity - The length of time a bucket covers.
 * @returns `"2026"` for years, `"Mar 26"` for months, `"5 Jan"` for weeks and days.
 */
export function formatBucketAxisLabel(bucketStart: Date, granularity: TimelineGranularity): string {
  switch (granularity) {
    case 'year':
      return String(bucketStart.getFullYear());
    case 'month':
      return `${monthAbbreviationOf(bucketStart)} ${formatTwoDigitYear(bucketStart)}`;
    case 'week':
    case 'day':
      return formatShortDate(bucketStart);
  }
}

/**
 * The heading of the tooltip shown for a bar.
 *
 * @param bucketStart - The start of the bucket.
 * @param granularity - The length of time a bucket covers.
 * @returns `"2026"`, `"Mar 2026"`, `"Week of 5 Jan 2026"` or `"5 Jan 2026"`.
 */
export function formatBucketTooltipTitle(
  bucketStart: Date,
  granularity: TimelineGranularity,
): string {
  switch (granularity) {
    case 'year':
      return String(bucketStart.getFullYear());
    case 'month':
      return `${monthAbbreviationOf(bucketStart)} ${bucketStart.getFullYear()}`;
    case 'week':
      return `Week of ${formatLongDate(bucketStart)}`;
    case 'day':
      return formatLongDate(bucketStart);
  }
}
