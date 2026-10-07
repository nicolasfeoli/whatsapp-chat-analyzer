import { describe, expect, it } from 'vitest';

import {
  MINIMUM_REPLIES_FOR_TYPICAL_DELAY,
  MOST_TREND_BUCKETS,
  TREND_TERM_COUNT,
  chooseTrendGranularity,
  trendBucketNumberOf,
  trendBucketStartOf,
} from '../../../src/core/analysis/trends';
import type { ChatMessage, ChatTrends, TrendBucket } from '../../../src/core/types';
import { analyseMessages } from '../../fixtures/analysis-readers';
import {
  deletedMessage,
  localMidnight,
  localTime,
  mediaMessage,
  textMessage,
} from '../../fixtures/messages';

/** Analyses invented messages and returns their trends. */
function trendsOf(messages: readonly ChatMessage[]): ChatTrends {
  return analyseMessages(messages).trends;
}

/** Finds a bucket by its position and fails the test when there is none. */
function bucketAt(trends: ChatTrends, index: number): TrendBucket {
  const bucket = trends.buckets[index];
  if (bucket === undefined) {
    throw new Error(`The trends have no bucket ${String(index)}`);
  }
  return bucket;
}

/**
 * Writes a run of replies between Ana and Bob in one minute of one day: Ana
 * asks on the full minute and Bob answers after the given seconds, once per
 * delay, each exchange a minute after the one before.
 */
function exchangesOn(day: string, bobDelaysInSeconds: readonly number[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const [index, delay] of bobDelaysInSeconds.entries()) {
    const minute = String(index).padStart(2, '0');
    const second = String(delay).padStart(2, '0');
    messages.push(textMessage({ sender: 'Ana', sentAt: `${day} 10:${minute}:00`, text: 'ready' }));
    messages.push(
      textMessage({ sender: 'Bob', sentAt: `${day} 10:${minute}:${second}`, text: 'yes' }),
    );
  }
  return messages;
}

describe('chooseTrendGranularity', () => {
  it('counts by month up to forty calendar months', () => {
    /* January 2021 to April 2024 is 3 × 12 + 4 = 40 months. */
    expect(
      chooseTrendGranularity(localTime('2021-01-31 10:00'), localTime('2024-04-01 10:00')),
    ).toBe('month');
  });

  it('counts by quarter from forty-one months on', () => {
    expect(
      chooseTrendGranularity(localTime('2021-01-31 10:00'), localTime('2024-05-01 10:00')),
    ).toBe('quarter');
  });

  it('counts by quarter up to forty quarters, and by year beyond', () => {
    /* The first quarter of 2015 to the last of 2024 is 40 quarters; one more day makes 41. */
    expect(
      chooseTrendGranularity(localTime('2015-01-01 10:00'), localTime('2024-12-31 10:00')),
    ).toBe('quarter');
    expect(
      chooseTrendGranularity(localTime('2015-01-01 10:00'), localTime('2025-01-01 10:00')),
    ).toBe('year');
  });

  it('has at most forty buckets by month and by quarter', () => {
    expect(MOST_TREND_BUCKETS).toBe(40);
  });
});

describe('trendBucketNumberOf and trendBucketStartOf', () => {
  it.each([
    { granularity: 'month' as const, moment: '2024-02-29 23:59', start: '2024-02-01' },
    { granularity: 'quarter' as const, moment: '2024-06-30 23:59', start: '2024-04-01' },
    { granularity: 'quarter' as const, moment: '2024-12-31 23:59', start: '2024-10-01' },
    { granularity: 'year' as const, moment: '2024-12-31 23:59', start: '2024-01-01' },
  ])(
    'place $moment in the $granularity that starts on $start',
    ({ granularity, moment, start }) => {
      const bucketNumber = trendBucketNumberOf(localTime(moment), granularity);

      expect(trendBucketStartOf(bucketNumber, granularity)).toEqual(localMidnight(start));
    },
  );

  it('give neighbouring buckets neighbouring numbers, across a new year too', () => {
    const december = trendBucketNumberOf(localTime('2023-12-31 23:59'), 'month');
    const january = trendBucketNumberOf(localTime('2024-01-01 00:00'), 'month');
    const lastQuarter = trendBucketNumberOf(localTime('2023-12-31 23:59'), 'quarter');
    const firstQuarter = trendBucketNumberOf(localTime('2024-01-01 00:00'), 'quarter');

    expect(january - december).toBe(1);
    expect(firstQuarter - lastQuarter).toBe(1);
  });
});

describe('analyseChat, the trends over time', () => {
  it('cuts the chat into the months from its first message to its last, empty ones included', () => {
    const trends = trendsOf([
      textMessage({ sentAt: '2024-01-13 10:00' }),
      textMessage({ sentAt: '2024-04-02 10:00' }),
    ]);

    expect(trends.granularity).toBe('month');
    expect(trends.buckets.map((bucket) => bucket.start)).toEqual([
      localMidnight('2024-01-01'),
      localMidnight('2024-02-01'),
      localMidnight('2024-03-01'),
      localMidnight('2024-04-01'),
    ]);
    expect(trends.buckets.map((bucket) => bucket.messageCount)).toEqual([1, 0, 0, 1]);
  });

  it('has one bucket for a chat of a single day', () => {
    const trends = trendsOf([textMessage({ sentAt: '2024-01-13 10:00' })]);

    expect(trends.buckets).toHaveLength(1);
  });

  it('counts by quarter in a chat of four years', () => {
    const trends = trendsOf([
      textMessage({ sentAt: '2021-02-13 10:00' }),
      textMessage({ sentAt: '2021-03-13 10:00' }),
      textMessage({ sentAt: '2024-11-02 10:00' }),
    ]);

    expect(trends.granularity).toBe('quarter');
    expect(trends.buckets).toHaveLength(16);
    expect(bucketAt(trends, 0).messageCount).toBe(2);
    expect(bucketAt(trends, 15).start).toEqual(localMidnight('2024-10-01'));
  });

  it('counts the messages of each person in each bucket', () => {
    const trends = trendsOf([
      textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
      textMessage({ sender: 'Bob', sentAt: '2024-01-13 10:01' }),
      textMessage({ sender: 'Ana', sentAt: '2024-01-14 10:00' }),
      textMessage({ sender: 'Bob', sentAt: '2024-02-01 10:00' }),
    ]);

    expect(bucketAt(trends, 0).messageCountsByName).toEqual(
      new Map([
        ['Ana', 2],
        ['Bob', 1],
      ]),
    );
    expect(bucketAt(trends, 1).messageCountsByName).toEqual(new Map([['Bob', 1]]));
  });

  it('counts typed messages and their words, media and night messages, bucket by bucket', () => {
    const trends = trendsOf([
      textMessage({ sentAt: '2024-01-13 10:00', text: 'three little words' }),
      textMessage({ sentAt: '2024-01-13 04:59', text: 'awake' }),
      mediaMessage({ sentAt: '2024-01-14 05:00', caption: 'a caption is not counted here' }),
      deletedMessage({ sentAt: '2024-01-15 10:00' }),
      mediaMessage({ sentAt: '2024-02-01 00:30' }),
    ]);

    const january = bucketAt(trends, 0);
    expect(january.messageCount).toBe(4);
    expect(january.textMessageCount).toBe(2);
    expect(january.wordCount).toBe(4);
    expect(january.mediaCount).toBe(1);
    expect(january.nightMessageCount).toBe(1);
    const february = bucketAt(trends, 1);
    expect(february.messageCount).toBe(1);
    expect(february.mediaCount).toBe(1);
    expect(february.nightMessageCount).toBe(1);
    expect(february.textMessageCount).toBe(0);
  });

  it('adds up to the totals of the chat', () => {
    const analysis = analyseMessages([
      ...exchangesOn('2024-01-13', [10, 20, 30]),
      mediaMessage({ sender: 'Bob', sentAt: '2024-03-02 02:00' }),
      textMessage({ sender: 'Carla', sentAt: '2024-05-20 23:00', text: 'late to the party' }),
    ]);

    const sumOf = (pick: (bucket: TrendBucket) => number): number =>
      analysis.trends.buckets.reduce((total, bucket) => total + pick(bucket), 0);
    expect(sumOf((bucket) => bucket.messageCount)).toBe(analysis.totalMessageCount);
    expect(sumOf((bucket) => bucket.mediaCount)).toBe(1);
    expect(sumOf((bucket) => bucket.nightMessageCount)).toBe(1);
  });

  describe('typical reply times', () => {
    it('gives a person the median of their replies in a bucket from five replies on', () => {
      const delays = [10, 20, 30, 40, 50];
      expect(delays).toHaveLength(MINIMUM_REPLIES_FOR_TYPICAL_DELAY);

      const trends = trendsOf(exchangesOn('2024-01-13', delays));

      expect(bucketAt(trends, 0).typicalReplyDelaysByName.get('Bob')).toBe(30_000);
    });

    it('gives nobody a time for four replies', () => {
      const trends = trendsOf(exchangesOn('2024-01-13', [10, 20, 30, 40]));

      expect(bucketAt(trends, 0).typicalReplyDelaysByName.has('Bob')).toBe(false);
    });

    it('measures each bucket by its own replies', () => {
      const trends = trendsOf([
        ...exchangesOn('2024-01-13', [10, 10, 10, 10, 10]),
        ...exchangesOn('2024-02-13', [50, 50, 50, 50, 50, 50]),
        ...exchangesOn('2024-03-13', [20, 20]),
      ]);

      expect(
        trends.buckets.map((bucket) => bucket.typicalReplyDelaysByName.get('Bob') ?? null),
      ).toEqual([10_000, 50_000, null]);
    });

    it('measures the last bucket too', () => {
      const trends = trendsOf([
        textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' }),
        ...exchangesOn('2024-02-13', [5, 6, 7, 8, 9]),
      ]);

      expect(bucketAt(trends, 1).typicalReplyDelaysByName.get('Bob')).toBe(7000);
    });
  });

  describe('the most used words and emojis over time', () => {
    it('counts the messages of each bucket that contain a word, the most used word first', () => {
      const trends = trendsOf([
        textMessage({ sentAt: '2024-01-13 10:00', text: 'dinner dinner tonight' }),
        textMessage({ sentAt: '2024-01-14 10:00', text: 'Dinner, anybody?' }),
        textMessage({ sentAt: '2024-03-02 10:00', text: 'tonight works' }),
      ]);

      /* "dinner" is written three times in two messages of January; a message counts once. */
      expect(trends.wordTrends[0]).toEqual({ term: 'dinner', messageCountsByBucket: [2, 0, 0] });
      expect(trends.wordTrends[1]).toEqual({ term: 'tonight', messageCountsByBucket: [1, 0, 1] });
    });

    it('finds a word as a whole word only', () => {
      const trends = trendsOf([
        textMessage({ sentAt: '2024-01-13 10:00', text: 'sunny sunny sunny' }),
        textMessage({ sentAt: '2024-01-14 10:00', text: 'sunnyside' }),
      ]);

      expect(trends.wordTrends[0]).toEqual({ term: 'sunny', messageCountsByBucket: [1] });
    });

    it('reads the caption of a photo like typed text', () => {
      const trends = trendsOf([
        mediaMessage({ sentAt: '2024-01-13 10:00', caption: 'summit reached' }),
        mediaMessage({ sentAt: '2024-01-14 10:00' }),
      ]);

      expect(trends.wordTrends.map((wordTrend) => wordTrend.term)).toContain('summit');
    });

    it('counts the messages that contain an emoji, and tells a skin tone apart', () => {
      const trends = trendsOf([
        textMessage({ sentAt: '2024-01-13 10:00', text: 'great 👍👍' }),
        textMessage({ sentAt: '2024-02-13 10:00', text: 'fine 👍' }),
        textMessage({ sentAt: '2024-02-14 10:00', text: 'ok 👍🏽' }),
      ]);

      expect(trends.emojiTrends).toEqual([
        { term: '👍', messageCountsByBucket: [1, 1] },
        { term: '👍🏽', messageCountsByBucket: [0, 1] },
      ]);
    });

    it('follows at most eight words', () => {
      const text = 'alpha bravo charlie delta echoes foxtrot golfing hotel india juliet';

      const trends = trendsOf([textMessage({ sentAt: '2024-01-13 10:00', text })]);

      expect(trends.wordTrends).toHaveLength(TREND_TERM_COUNT);
      expect(trends.wordTrends[0]?.term).toBe('alpha');
    });

    it('has no word and no emoji to follow in a chat of photos', () => {
      const trends = trendsOf([mediaMessage({ sentAt: '2024-01-13 10:00' })]);

      expect(trends.wordTrends).toEqual([]);
      expect(trends.emojiTrends).toEqual([]);
    });
  });
});
