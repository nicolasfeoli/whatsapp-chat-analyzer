import { describe, expect, it } from 'vitest';

import type { ChatAnalysis, ChatTrends, TrendBucket } from '../../src/core/types';
import { assignPersonColours } from '../../src/ui/person-colours';
import {
  FEWEST_POINTS_FOR_A_LINE,
  MINIMUM_MESSAGES_FOR_TREND_POINT,
  OTHERS_TREND_LABEL,
  SMALLEST_DURATION_FACTOR_WORTH_A_SENTENCE,
  SMALLEST_SHARE_CHANGE_WORTH_A_SENTENCE,
  SMALLEST_WORDS_FACTOR_WORTH_A_SENTENCE,
  buildTrendCharts,
  countBucketsPerEnd,
  findTrendChange,
  formatTrendBucketLabel,
  formatTrendBucketRange,
  formatTrendValue,
  smallestChangeWorthASentence,
  strengthOfTrendChange,
} from '../../src/ui/trends';
import type { TrendChartData, TrendChartKind } from '../../src/ui/trends';
import { chatAnalysis, personStatistics } from '../fixtures/analysis-builders';
import { trendBucket, trendsByMonth } from '../fixtures/trends';
import { localMidnight } from '../fixtures/messages';

/** Builds the charts of an analysis with the given trends and people. */
function chartsOf(trends: ChatTrends, names: readonly string[] = ['Ana', 'Bob']): TrendChartData[] {
  const analysis: ChatAnalysis = chatAnalysis({
    trends,
    people: names.map((name, index) => personStatistics({ name, messageCount: 1000 - index })),
  });
  return buildTrendCharts(analysis, assignPersonColours(analysis.people));
}

/** Finds a chart by its kind and fails the test when it was left out. */
function chartOf(charts: readonly TrendChartData[], kind: TrendChartKind): TrendChartData {
  const chart = charts.find((candidate) => candidate.kind === kind);
  if (chart === undefined) {
    throw new Error(`There is no "${kind}" chart`);
  }
  return chart;
}

/**
 * Eight months of 2024 in which Ana's share falls from 80% to 20%, Bob's
 * replies slow from one minute to eight, the messages get shorter, and
 * media and night messages become more common.
 */
const changingChat: ChatTrends = trendsByMonth('2024-01', [
  { ana: 80, bob: 20, bobReplyMinutes: 1, wordsPerMessage: 10, media: 0, night: 0 },
  { ana: 80, bob: 20, bobReplyMinutes: 1, wordsPerMessage: 10, media: 0, night: 0 },
  { ana: 70, bob: 30, bobReplyMinutes: 2, wordsPerMessage: 8, media: 5, night: 2 },
  { ana: 60, bob: 40, bobReplyMinutes: 3, wordsPerMessage: 7, media: 10, night: 4 },
  { ana: 40, bob: 60, bobReplyMinutes: 4, wordsPerMessage: 6, media: 15, night: 6 },
  { ana: 30, bob: 70, bobReplyMinutes: 6, wordsPerMessage: 5, media: 20, night: 8 },
  { ana: 20, bob: 80, bobReplyMinutes: 8, wordsPerMessage: 4, media: 30, night: 10 },
  { ana: 20, bob: 80, bobReplyMinutes: 8, wordsPerMessage: 4, media: 30, night: 10 },
]);

describe('buildTrendCharts', () => {
  it('draws five charts for a chat in which everything can be measured', () => {
    expect(chartsOf(changingChat).map((chart) => chart.kind)).toEqual([
      'message-share',
      'reply-time',
      'words-per-message',
      'media-share',
      'night-share',
    ]);
  });

  it('names every bucket of every chart', () => {
    const chart = chartOf(chartsOf(changingChat), 'media-share');

    expect(chart.bucketLabels).toEqual([
      'Jan 2024',
      'Feb 2024',
      'Mar 2024',
      'Apr 2024',
      'May 2024',
      'Jun 2024',
      'Jul 2024',
      'Aug 2024',
    ]);
  });

  describe('the share of the messages', () => {
    it('gives each person a line in their colour, as a share of each bucket', () => {
      const chart = chartOf(chartsOf(changingChat), 'message-share');

      expect(chart.series.map((series) => [series.label, series.colour])).toEqual([
        ['Ana', 'var(--s1)'],
        ['Bob', 'var(--s2)'],
      ]);
      expect(chart.series[0]?.values).toEqual([0.8, 0.8, 0.7, 0.6, 0.4, 0.3, 0.2, 0.2]);
    });

    it('says in words whose share changed most, with both ends of the chart', () => {
      const chart = chartOf(chartsOf(changingChat), 'message-share');

      expect(chart.reading).toBe(
        "Ana's share of the messages went from about 80% in Jan–Feb 2024 to about 20% in Jul–Aug 2024.",
      );
    });

    it('has a point for a bucket of exactly twenty messages and none for nineteen', () => {
      const thinMonths = trendsByMonth('2024-01', [
        { ana: MINIMUM_MESSAGES_FOR_TREND_POINT, bob: 0 },
        { ana: MINIMUM_MESSAGES_FOR_TREND_POINT - 1, bob: 0 },
        { ana: 30, bob: 10 },
        { ana: 30, bob: 10 },
      ]);

      const chart = chartOf(chartsOf(thinMonths), 'message-share');

      expect(chart.series[0]?.values).toEqual([1, null, 0.75, 0.75]);
    });

    it('merges everybody beyond the six with a colour into one more line', () => {
      const names = ['Ana', 'Bob', 'Carla', 'Dani', 'Marta', 'Diego', 'Elena', 'Félix'];
      const bucketOfEight = (monthStart: string): TrendBucket =>
        trendBucket(monthStart, {
          messageCount: 100,
          messageCountsByName: new Map([
            ['Ana', 40],
            ['Bob', 20],
            ['Carla', 10],
            ['Dani', 10],
            ['Marta', 5],
            ['Diego', 5],
            ['Elena', 6],
            ['Félix', 4],
          ]),
        });
      const trends: ChatTrends = {
        granularity: 'month',
        buckets: ['2024-01-01', '2024-02-01', '2024-03-01'].map(bucketOfEight),
        wordTrends: [],
        emojiTrends: [],
      };

      const chart = chartOf(chartsOf(trends, names), 'message-share');

      expect(chart.series.map((series) => series.label)).toEqual([
        'Ana',
        'Bob',
        'Carla',
        'Dani',
        'Marta',
        'Diego',
        OTHERS_TREND_LABEL,
      ]);
      expect(chart.series.at(-1)).toEqual({
        label: OTHERS_TREND_LABEL,
        colour: 'var(--other)',
        values: [0.1, 0.1, 0.1],
      });
    });

    it('is left out of a chat with a single sender, whose share is always everything', () => {
      const charts = chartsOf(changingChat, ['Ana']);

      expect(charts.map((chart) => chart.kind)).not.toContain('message-share');
    });
  });

  describe('the typical reply time', () => {
    it('draws a line for whoever has a time in at least three buckets', () => {
      const chart = chartOf(chartsOf(changingChat), 'reply-time');

      expect(chart.series.map((series) => series.label)).toEqual(['Bob']);
      expect(chart.series[0]?.values.slice(0, 3)).toEqual([60_000, 60_000, 120_000]);
    });

    it('says in words how the time changed', () => {
      const chart = chartOf(chartsOf(changingChat), 'reply-time');

      expect(chart.reading).toBe(
        "Bob's typical reply went from about 1 min in Jan–Feb 2024 to about 8 min in Jul–Aug 2024.",
      );
    });

    it('is left out when nobody has a time in three buckets', () => {
      const fewReplies = trendsByMonth('2024-01', [
        { ana: 30, bob: 30, bobReplyMinutes: 1 },
        { ana: 30, bob: 30 },
        { ana: 30, bob: 30, bobReplyMinutes: 2 },
        { ana: 30, bob: 30 },
      ]);
      expect(FEWEST_POINTS_FOR_A_LINE).toBe(3);

      expect(chartsOf(fewReplies).map((chart) => chart.kind)).not.toContain('reply-time');
    });
  });

  describe('the charts of the whole chat', () => {
    it('measure words per typed message, media and night messages against each bucket', () => {
      const charts = chartsOf(changingChat);

      expect(chartOf(charts, 'words-per-message').series[0]?.values).toEqual([
        10, 10, 8, 7, 6, 5, 4, 4,
      ]);
      expect(chartOf(charts, 'media-share').series[0]?.values.slice(-2)).toEqual([0.3, 0.3]);
      expect(chartOf(charts, 'night-share').series[0]?.values.slice(-2)).toEqual([0.1, 0.1]);
    });

    it('say the change in words, each in its own terms', () => {
      const charts = chartsOf(changingChat);

      expect(chartOf(charts, 'words-per-message').reading).toBe(
        'A typed message went from about 10.0 words in Jan–Feb 2024 to about 4.0 in Jul–Aug 2024.',
      );
      expect(chartOf(charts, 'media-share').reading).toBe(
        'Photos, stickers, voice notes and other media went from about 0.0% of the messages in Jan–Feb 2024 to about 30% in Jul–Aug 2024.',
      );
      expect(chartOf(charts, 'night-share').reading).toBe(
        'Messages sent between midnight and 5:00 went from about 0.0% of all messages in Jan–Feb 2024 to about 10% in Jul–Aug 2024.',
      );
    });

    it('leave out a chart whose line would be nothing but zeros', () => {
      const withoutMedia = trendsByMonth('2024-01', [
        { ana: 30, bob: 30, night: 3 },
        { ana: 30, bob: 30, night: 3 },
        { ana: 30, bob: 30, night: 3 },
      ]);

      const kinds = chartsOf(withoutMedia).map((chart) => chart.kind);

      expect(kinds).not.toContain('media-share');
      expect(kinds).toContain('night-share');
    });

    it('write no sentence when the change is small', () => {
      const steadyChat = trendsByMonth('2024-01', [
        { ana: 50, bob: 50, media: 10, wordsPerMessage: 5 },
        { ana: 50, bob: 50, media: 10, wordsPerMessage: 5 },
        { ana: 52, bob: 48, media: 11, wordsPerMessage: 5 },
        { ana: 52, bob: 48, media: 12, wordsPerMessage: 5 },
        { ana: 53, bob: 47, media: 12, wordsPerMessage: 6 },
        { ana: 53, bob: 47, media: 12, wordsPerMessage: 6 },
      ]);

      const charts = chartsOf(steadyChat);

      expect(charts.map((chart) => chart.reading)).toEqual([null, null, null]);
    });
  });

  it('draws nothing for a chat without a bucket that can be measured', () => {
    const thinChat = trendsByMonth('2024-01', [
      { ana: 2, bob: 1 },
      { ana: 2, bob: 1 },
      { ana: 2, bob: 1 },
    ]);

    expect(chartsOf(thinChat)).toEqual([]);
  });
});

describe('findTrendChange', () => {
  it('compares the mean of the first quarter of the buckets with that of the last', () => {
    /* Eight buckets: two at each end. */
    expect(findTrendChange([1, 3, 9, 9, 9, 9, 5, 7])).toEqual({ early: 2, late: 6 });
  });

  it('takes at least two buckets at each end, and a quarter of them in a long chart', () => {
    expect(countBucketsPerEnd(6)).toBe(2);
    expect(countBucketsPerEnd(15)).toBe(4);
    expect(countBucketsPerEnd(40)).toBe(10);
  });

  it('skips the buckets that were not measured', () => {
    /* Twelve buckets: three at each end. */
    const values = [null, 2, 4, 9, 9, 9, 9, 9, 9, 6, null, 10];

    expect(findTrendChange(values)).toEqual({ early: 3, late: 8 });
  });

  it('gives up when an end has a single measured point', () => {
    expect(findTrendChange([1, null, 9, 9, 9, 9, 5, 7])).toBeNull();
    expect(findTrendChange([1, 3, 9, 9, 9, 9, null, 7])).toBeNull();
  });

  it('gives up when the two ends would overlap', () => {
    expect(findTrendChange([1, 2, 3])).toBeNull();
    expect(findTrendChange([1, 2, 3, 4])).toEqual({ early: 1.5, late: 3.5 });
  });
});

describe('the rule for what is worth a sentence', () => {
  it('asks a share to move by five percentage points', () => {
    const threshold = smallestChangeWorthASentence('share');

    expect(threshold).toBe(SMALLEST_SHARE_CHANGE_WORTH_A_SENTENCE);
    expect(strengthOfTrendChange({ early: 0.25, late: 0.5 }, 'share')).toBe(0.25);
    expect(strengthOfTrendChange({ early: 0.5, late: 0.25 }, 'share')).toBe(0.25);
    expect(strengthOfTrendChange({ early: 0.2, late: 0.24 }, 'share')).toBeLessThan(threshold);
  });

  it('asks a reply time to double or halve', () => {
    const threshold = smallestChangeWorthASentence('duration');

    expect(threshold).toBe(SMALLEST_DURATION_FACTOR_WORTH_A_SENTENCE);
    expect(strengthOfTrendChange({ early: 120_000, late: 240_000 }, 'duration')).toBe(2);
    expect(strengthOfTrendChange({ early: 240_000, late: 120_000 }, 'duration')).toBe(2);
    expect(strengthOfTrendChange({ early: 120_000, late: 230_000 }, 'duration')).toBeLessThan(
      threshold,
    );
  });

  it('treats reply times under a minute alike, so seconds never make a sentence', () => {
    expect(strengthOfTrendChange({ early: 0, late: 50_000 }, 'duration')).toBe(1);
    expect(strengthOfTrendChange({ early: 5000, late: 120_000 }, 'duration')).toBe(2);
  });

  it('asks the words per message to change by a quarter', () => {
    const threshold = smallestChangeWorthASentence('words');

    expect(threshold).toBe(SMALLEST_WORDS_FACTOR_WORTH_A_SENTENCE);
    expect(strengthOfTrendChange({ early: 4, late: 5 }, 'words')).toBe(1.25);
    expect(strengthOfTrendChange({ early: 4, late: 4.9 }, 'words')).toBeLessThan(threshold);
    expect(strengthOfTrendChange({ early: 0, late: 0 }, 'words')).toBe(1);
  });
});

describe('the names of buckets', () => {
  it('names a month, a quarter and a year', () => {
    expect(formatTrendBucketLabel(localMidnight('2022-03-01'), 'month')).toBe('Mar 2022');
    expect(formatTrendBucketLabel(localMidnight('2022-10-01'), 'quarter')).toBe('Q4 2022');
    expect(formatTrendBucketLabel(localMidnight('2022-01-01'), 'year')).toBe('2022');
  });

  it('names a run of months within a year and across a new year', () => {
    expect(
      formatTrendBucketRange(localMidnight('2022-03-01'), localMidnight('2022-05-01'), 'month'),
    ).toBe('Mar–May 2022');
    expect(
      formatTrendBucketRange(localMidnight('2022-11-01'), localMidnight('2023-01-01'), 'month'),
    ).toBe('Nov 2022–Jan 2023');
  });

  it('names a run of quarters and a run of years', () => {
    expect(
      formatTrendBucketRange(localMidnight('2022-01-01'), localMidnight('2022-04-01'), 'quarter'),
    ).toBe('Q1–Q2 2022');
    expect(
      formatTrendBucketRange(localMidnight('2022-10-01'), localMidnight('2023-01-01'), 'quarter'),
    ).toBe('Q4 2022–Q1 2023');
    expect(
      formatTrendBucketRange(localMidnight('2021-01-01'), localMidnight('2022-01-01'), 'year'),
    ).toBe('2021–2022');
  });

  it('names a run of one bucket by that bucket', () => {
    expect(
      formatTrendBucketRange(localMidnight('2022-03-01'), localMidnight('2022-03-01'), 'month'),
    ).toBe('Mar 2022');
  });
});

describe('formatTrendValue', () => {
  it('writes a share as a percentage, a time as a duration and an average with one decimal', () => {
    expect(formatTrendValue(0.412, 'share', 'second')).toBe('41%');
    expect(formatTrendValue(720_000, 'duration', 'second')).toBe('12 min');
    expect(formatTrendValue(6.44, 'words', 'second')).toBe('6.4');
  });

  it('does not claim seconds an export of minutes does not have', () => {
    expect(formatTrendValue(0, 'duration', 'minute')).toBe('under 1 min');
  });
});
