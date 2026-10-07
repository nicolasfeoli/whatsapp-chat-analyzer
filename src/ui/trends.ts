/**
 * What the "How things changed" section draws and says: the lines of each
 * small chart, and the sentence under it that puts the change into words.
 *
 * Everything here is a pure function of the trends the analysis holds. The
 * charts are drawn by `charts/trend-chart.ts` and put together by
 * `sections/trends.ts`.
 */

import { MILLISECONDS_PER_MINUTE } from '../core/index';
import type {
  ChatAnalysis,
  PersonStatistics,
  TimestampResolution,
  TrendBucket,
  TrendGranularity,
} from '../core/index';
import { COLOURED_PEOPLE_LIMIT, OTHER_PEOPLE_COLOUR, colourOfPerson } from './person-colours';
import type { PersonColours } from './person-colours';
import { formatReplyDelay } from './sections/featured-people';
import { formatPercentage, monthAbbreviationOf } from './text-formatting';

/**
 * A bucket needs this many messages (for words per message: typed messages)
 * before a share or an average is drawn for it. A share of five messages is
 * a coin toss, and one such point would pull the eye more than a busy month.
 */
export const MINIMUM_MESSAGES_FOR_TREND_POINT = 20;

/** A line needs this many measured points; two points are a stroke, not a trend. */
export const FEWEST_POINTS_FOR_A_LINE = 3;

/**
 * The sentence under a chart compares the first and the last quarter of the
 * buckets. Each end needs this many measured points, so that one odd month
 * does not stand for "early" or "late".
 */
export const FEWEST_POINTS_PER_END = 2;

/** The part of the buckets that counts as the early end, and as the late end. */
const SHARE_OF_BUCKETS_PER_END = 0.25;

/**
 * A share has to move by this much, five percentage points, before the
 * sentence under its chart is written; less is within what one busy week does.
 */
export const SMALLEST_SHARE_CHANGE_WORTH_A_SENTENCE = 0.05;

/**
 * A typical reply time has to double or halve before it is put into words;
 * medians of a handful of replies move by less than that on their own.
 */
export const SMALLEST_DURATION_FACTOR_WORTH_A_SENTENCE = 2;

/** The words per message have to grow or shrink by a quarter before they are put into words. */
export const SMALLEST_WORDS_FACTOR_WORTH_A_SENTENCE = 1.25;

/**
 * Reply times under a minute are treated alike when two ends are compared:
 * an export that only records minutes cannot tell them apart, and "from 5 s
 * to 20 s" is not a change of habit.
 */
const SHORTEST_DURATION_COMPARED = MILLISECONDS_PER_MINUTE;

/** Averages of words under this are treated alike when two ends are compared, to keep a zero out of a division. */
const SMALLEST_WORD_AVERAGE_COMPARED = 0.1;

/** The months of a quarter. */
const MONTHS_PER_QUARTER = 3;

/** What separates the two ends of a range of buckets, as in "Mar–May 2022": an en dash. */
const RANGE_DASH = '–';

/** The label of the line that adds up everyone without a colour of their own. */
export const OTHERS_TREND_LABEL = 'Others';

/** The colour of a chart with a single line, which stands for the whole chat. */
const WHOLE_CHAT_LINE_COLOUR = 'var(--accent)';

/** What the numbers of a chart are: a share of messages, a length of time, or words per message. */
export type TrendUnit = 'share' | 'duration' | 'words';

/** Which chart of the section a chart is. */
export type TrendChartKind =
  'message-share' | 'reply-time' | 'words-per-message' | 'media-share' | 'night-share';

/** One line of a chart. */
export interface TrendSeries {
  /** Whose line it is, or what it measures; untrusted when it is a name. */
  readonly label: string;
  /** The CSS colour of the line. */
  readonly colour: string;
  /** One value per bucket; `null` where there was too little to measure. */
  readonly values: readonly (number | null)[];
}

/** One small chart with the sentence that reads it. */
export interface TrendChartData {
  /** Which chart it is. */
  readonly kind: TrendChartKind;
  /** The heading of the chart. */
  readonly title: string;
  /** What its numbers are. */
  readonly unit: TrendUnit;
  /** Its lines; never empty. */
  readonly series: readonly TrendSeries[];
  /** The name of each bucket, e.g. `"Mar 2022"`, oldest first. */
  readonly bucketLabels: readonly string[];
  /** The change in words, or `null` when it is within noise or cannot be measured. */
  readonly reading: string | null;
  /** Whether the export records seconds, for writing reply times honestly. */
  readonly timestampResolution: TimestampResolution;
}

/** The typical value at the early end and at the late end of a line. */
export interface TrendChange {
  /** The mean of the measured points among the first quarter of the buckets. */
  readonly early: number;
  /** The mean of the measured points among the last quarter of the buckets. */
  readonly late: number;
}

/**
 * Writes a value of a chart for display.
 *
 * @param value - The value of a point.
 * @param unit - What the numbers of the chart are.
 * @param timestampResolution - Whether the export records seconds.
 * @returns For example `"41%"`, `"12 min"` or `"6.4"`.
 */
export function formatTrendValue(
  value: number,
  unit: TrendUnit,
  timestampResolution: TimestampResolution,
): string {
  switch (unit) {
    case 'share':
      return formatPercentage(value);
    case 'duration':
      return formatReplyDelay(value, timestampResolution);
    case 'words':
      return value.toFixed(1);
  }
}

/**
 * The number of the quarter a month falls in.
 */
function quarterNumberOf(bucketStart: Date): number {
  return Math.floor(bucketStart.getMonth() / MONTHS_PER_QUARTER) + 1;
}

/**
 * Names a bucket without its year.
 */
function formatBucketWithinYear(bucketStart: Date, granularity: TrendGranularity): string {
  return granularity === 'month'
    ? monthAbbreviationOf(bucketStart)
    : `Q${String(quarterNumberOf(bucketStart))}`;
}

/**
 * Names a bucket.
 *
 * @param bucketStart - When the bucket starts.
 * @param granularity - The length of time a bucket covers.
 * @returns `"Mar 2022"`, `"Q1 2022"` or `"2022"`.
 */
export function formatTrendBucketLabel(bucketStart: Date, granularity: TrendGranularity): string {
  const year = String(bucketStart.getFullYear());
  if (granularity === 'year') {
    return year;
  }
  return `${formatBucketWithinYear(bucketStart, granularity)} ${year}`;
}

/**
 * Names a run of buckets by its first and its last.
 *
 * @param firstStart - When the first bucket starts.
 * @param lastStart - When the last bucket starts.
 * @param granularity - The length of time a bucket covers.
 * @returns `"Mar–May 2022"`, `"Nov 2022–Jan 2023"`, `"Q1–Q2 2022"`,
 *   `"2021–2022"`, or the name of the one bucket when both are the same.
 */
export function formatTrendBucketRange(
  firstStart: Date,
  lastStart: Date,
  granularity: TrendGranularity,
): string {
  const lastLabel = formatTrendBucketLabel(lastStart, granularity);
  if (firstStart.getTime() === lastStart.getTime()) {
    return lastLabel;
  }
  const isWithinOneYear = firstStart.getFullYear() === lastStart.getFullYear();
  if (granularity !== 'year' && isWithinOneYear) {
    return `${formatBucketWithinYear(firstStart, granularity)}${RANGE_DASH}${lastLabel}`;
  }
  return `${formatTrendBucketLabel(firstStart, granularity)}${RANGE_DASH}${lastLabel}`;
}

/**
 * How many buckets each end of a comparison takes: a quarter of them, and at
 * least as many as an end needs measured points.
 *
 * @param bucketCount - The buckets of the chat.
 * @returns The number of buckets at each end.
 */
export function countBucketsPerEnd(bucketCount: number): number {
  return Math.max(FEWEST_POINTS_PER_END, Math.round(bucketCount * SHARE_OF_BUCKETS_PER_END));
}

/**
 * The mean of the measured values of a run, when there are enough of them.
 */
function meanOfMeasured(values: readonly (number | null)[]): number | null {
  const measured = values.filter((value: number | null): value is number => value !== null);
  if (measured.length < FEWEST_POINTS_PER_END) {
    return null;
  }
  let total = 0;
  for (const value of measured) {
    total += value;
  }
  return total / measured.length;
}

/**
 * Compares the early end of a line with its late end.
 *
 * @param values - One value per bucket; `null` where nothing was measured.
 * @returns The mean of each end, or `null` when the two ends would overlap
 *   or either has fewer than two measured points.
 */
export function findTrendChange(values: readonly (number | null)[]): TrendChange | null {
  const bucketsPerEnd = countBucketsPerEnd(values.length);
  if (bucketsPerEnd * 2 > values.length) {
    return null;
  }
  const early = meanOfMeasured(values.slice(0, bucketsPerEnd));
  const late = meanOfMeasured(values.slice(values.length - bucketsPerEnd));
  return early === null || late === null ? null : { early, late };
}

/**
 * How strongly a line changed, on the scale its unit is judged by: the
 * difference in share for a share, and the factor between the two ends, in
 * whichever direction, for a time or an average.
 *
 * @param change - The two ends of the line.
 * @param unit - What the numbers of the chart are.
 * @returns The strength; compare it with {@link smallestChangeWorthASentence}.
 */
export function strengthOfTrendChange(change: TrendChange, unit: TrendUnit): number {
  if (unit === 'share') {
    return Math.abs(change.late - change.early);
  }
  const floor = unit === 'duration' ? SHORTEST_DURATION_COMPARED : SMALLEST_WORD_AVERAGE_COMPARED;
  const early = Math.max(change.early, floor);
  const late = Math.max(change.late, floor);
  return Math.max(late / early, early / late);
}

/**
 * The smallest strength of a change that is put into words, per unit.
 *
 * @param unit - What the numbers of the chart are.
 * @returns Five percentage points, a factor of two, or a factor of one and a quarter.
 */
export function smallestChangeWorthASentence(unit: TrendUnit): number {
  switch (unit) {
    case 'share':
      return SMALLEST_SHARE_CHANGE_WORTH_A_SENTENCE;
    case 'duration':
      return SMALLEST_DURATION_FACTOR_WORTH_A_SENTENCE;
    case 'words':
      return SMALLEST_WORDS_FACTOR_WORTH_A_SENTENCE;
  }
}

/** How the sentence of each chart starts and what stands after its first number. */
interface ReadingWording {
  /** Writes the subject of the sentence from the label of the line. */
  readonly subjectOf: (seriesLabel: string) => string;
  /** What follows the first number, e.g. `" of the messages"`; empty when nothing does. */
  readonly afterFirstValue: string;
}

/** The wording of the sentence under each chart. */
const READING_WORDINGS: Readonly<Record<TrendChartKind, ReadingWording>> = {
  'message-share': {
    subjectOf: (seriesLabel: string): string => `${seriesLabel}'s share of the messages`,
    afterFirstValue: '',
  },
  'reply-time': {
    subjectOf: (seriesLabel: string): string => `${seriesLabel}'s typical reply`,
    afterFirstValue: '',
  },
  'words-per-message': {
    subjectOf: (): string => 'A typed message',
    afterFirstValue: ' words',
  },
  'media-share': {
    subjectOf: (): string => 'Photos, stickers, voice notes and other media',
    afterFirstValue: ' of the messages',
  },
  'night-share': {
    subjectOf: (): string => 'Messages sent between midnight and 5:00',
    afterFirstValue: ' of all messages',
  },
};

/** A chart before its sentence is written. */
type UnreadTrendChart = Omit<TrendChartData, 'reading' | 'bucketLabels'>;

/**
 * Writes the sentence under a chart: the line that changed most between the
 * first and the last quarter of the buckets, with both values and both
 * stretches of time. The "Others" line is not put into words, since it is
 * nobody's habit.
 *
 * @param chart - The chart.
 * @param buckets - The buckets of the chat.
 * @param granularity - The length of time a bucket covers.
 * @returns The sentence, or `null` when no line changed by more than noise.
 */
export function describeTrendChange(
  chart: UnreadTrendChart,
  buckets: readonly TrendBucket[],
  granularity: TrendGranularity,
): string | null {
  let strongest: { series: TrendSeries; change: TrendChange; strength: number } | null = null;
  for (const series of chart.series) {
    const change = series.label === OTHERS_TREND_LABEL ? null : findTrendChange(series.values);
    if (change === null) {
      continue;
    }
    const strength = strengthOfTrendChange(change, chart.unit);
    if (strongest === null || strength > strongest.strength) {
      strongest = { series, change, strength };
    }
  }
  if (strongest === null || strongest.strength < smallestChangeWorthASentence(chart.unit)) {
    return null;
  }

  const bucketsPerEnd = countBucketsPerEnd(buckets.length);
  const firstBucket = buckets[0];
  const lastEarlyBucket = buckets[bucketsPerEnd - 1];
  const firstLateBucket = buckets[buckets.length - bucketsPerEnd];
  const lastBucket = buckets[buckets.length - 1];
  if (
    firstBucket === undefined ||
    lastEarlyBucket === undefined ||
    firstLateBucket === undefined ||
    lastBucket === undefined
  ) {
    return null;
  }
  const earlyRange = formatTrendBucketRange(firstBucket.start, lastEarlyBucket.start, granularity);
  const lateRange = formatTrendBucketRange(firstLateBucket.start, lastBucket.start, granularity);
  const wording = READING_WORDINGS[chart.kind];
  const early = formatTrendValue(strongest.change.early, chart.unit, chart.timestampResolution);
  const late = formatTrendValue(strongest.change.late, chart.unit, chart.timestampResolution);
  return `${wording.subjectOf(strongest.series.label)} went from about ${early}${wording.afterFirstValue} in ${earlyRange} to about ${late} in ${lateRange}.`;
}

/**
 * Divides one count of a bucket by another, when the divisor is large enough.
 */
function shareWhenMeasurable(numerator: number, denominator: number): number | null {
  return denominator >= MINIMUM_MESSAGES_FOR_TREND_POINT ? numerator / denominator : null;
}

/**
 * Tells whether a line is worth drawing: enough measured points, and not all of them zero.
 */
function isLineWorthDrawing(series: TrendSeries): boolean {
  const measured = series.values.filter((value: number | null): value is number => value !== null);
  return (
    measured.length >= FEWEST_POINTS_FOR_A_LINE &&
    measured.some((value: number): boolean => value > 0)
  );
}

/**
 * The lines of each person's share of the messages: one per person with a
 * colour of their own, and one for everybody else together.
 */
function buildMessageShareSeries(
  analysis: ChatAnalysis,
  colouredPeople: readonly PersonStatistics[],
  personColours: PersonColours,
): TrendSeries[] {
  const { buckets } = analysis.trends;
  const series = colouredPeople.map((person: PersonStatistics): TrendSeries => ({
    label: person.name,
    colour: colourOfPerson(personColours, person.name),
    values: buckets.map((bucket: TrendBucket): number | null =>
      shareWhenMeasurable(bucket.messageCountsByName.get(person.name) ?? 0, bucket.messageCount),
    ),
  }));
  if (analysis.people.length <= colouredPeople.length) {
    return series;
  }

  const colouredNames = new Set(
    colouredPeople.map((person: PersonStatistics): string => person.name),
  );
  const othersValues = buckets.map((bucket: TrendBucket): number | null => {
    let othersCount = 0;
    for (const [name, messageCount] of bucket.messageCountsByName) {
      if (!colouredNames.has(name)) {
        othersCount += messageCount;
      }
    }
    return shareWhenMeasurable(othersCount, bucket.messageCount);
  });
  return [
    ...series,
    { label: OTHERS_TREND_LABEL, colour: OTHER_PEOPLE_COLOUR, values: othersValues },
  ];
}

/**
 * Builds the charts of the section, in the order they are shown, each with
 * its sentence. A line with fewer than three measured points, or with
 * nothing but zeros, is not drawn, and a chart without a line is left out.
 *
 * Lines per person are drawn for the six people who have a colour of their
 * own, however many the report lists; the shares of everybody else are added
 * up in one more line.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @returns Up to five charts.
 */
export function buildTrendCharts(
  analysis: ChatAnalysis,
  personColours: PersonColours,
): TrendChartData[] {
  const { buckets, granularity } = analysis.trends;
  const { timestampResolution } = analysis;
  const colouredPeople = analysis.people.slice(0, COLOURED_PEOPLE_LIMIT);
  const wholeChatSeries = (
    label: string,
    valueOf: (bucket: TrendBucket) => number | null,
  ): TrendSeries[] => [{ label, colour: WHOLE_CHAT_LINE_COLOUR, values: buckets.map(valueOf) }];

  const candidates: UnreadTrendChart[] = [
    {
      kind: 'message-share',
      title: 'Share of the messages',
      unit: 'share',
      series:
        analysis.people.length > 1
          ? buildMessageShareSeries(analysis, colouredPeople, personColours)
          : [],
      timestampResolution,
    },
    {
      kind: 'reply-time',
      title: 'Typical reply time',
      unit: 'duration',
      series: colouredPeople.map((person: PersonStatistics): TrendSeries => ({
        label: person.name,
        colour: colourOfPerson(personColours, person.name),
        values: buckets.map(
          (bucket: TrendBucket): number | null =>
            bucket.typicalReplyDelaysByName.get(person.name) ?? null,
        ),
      })),
      timestampResolution,
    },
    {
      kind: 'words-per-message',
      title: 'Words per typed message',
      unit: 'words',
      series: wholeChatSeries('Words per message', (bucket: TrendBucket): number | null =>
        shareWhenMeasurable(bucket.wordCount, bucket.textMessageCount),
      ),
      timestampResolution,
    },
    {
      kind: 'media-share',
      title: 'Share of media',
      unit: 'share',
      series: wholeChatSeries('Media', (bucket: TrendBucket): number | null =>
        shareWhenMeasurable(bucket.mediaCount, bucket.messageCount),
      ),
      timestampResolution,
    },
    {
      kind: 'night-share',
      title: 'Share sent at night',
      unit: 'share',
      series: wholeChatSeries('Midnight to 5:00', (bucket: TrendBucket): number | null =>
        shareWhenMeasurable(bucket.nightMessageCount, bucket.messageCount),
      ),
      timestampResolution,
    },
  ];

  const bucketLabels = buckets.map((bucket: TrendBucket): string =>
    formatTrendBucketLabel(bucket.start, granularity),
  );
  const charts: TrendChartData[] = [];
  for (const candidate of candidates) {
    const series = candidate.series.filter(isLineWorthDrawing);
    if (series.length === 0) {
      continue;
    }
    const chart = { ...candidate, series };
    charts.push({
      ...chart,
      bucketLabels,
      reading: describeTrendChange(chart, buckets, granularity),
    });
  }
  return charts;
}
