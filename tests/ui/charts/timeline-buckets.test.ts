import { describe, expect, it } from 'vitest';

import {
  buildTimelineData,
  chooseTimelineGranularity,
  floorToBucketStart,
  formatBucketAxisLabel,
  formatBucketTooltipTitle,
  nextBucketStart,
} from '../../../src/ui/charts/timeline-buckets';
import type { TimelineData } from '../../../src/ui/charts/timeline-buckets';
import { assignPersonColours } from '../../../src/ui/person-colours';
import type { ChatMessage } from '../../../src/core/types';
import { analyseMessages } from '../../fixtures/analysis-readers';
import { localMidnight, localTime, textMessage } from '../../fixtures/messages';

/**
 * Analyses invented messages and groups them into timeline buckets, the way
 * the report does.
 */
function buildTimelineFor(messages: readonly ChatMessage[]): TimelineData {
  const analysis = analyseMessages(messages);
  return buildTimelineData(analysis, assignPersonColours(analysis.people));
}

/**
 * Lists the start of every bucket, to state which periods a timeline covers.
 */
function bucketStartsOf(timeline: TimelineData): Date[] {
  return timeline.buckets.map((bucket) => bucket.start);
}

describe('chooseTimelineGranularity', () => {
  it.each([
    { spanInDays: 1, expected: 'day' },
    { spanInDays: 45, expected: 'day' },
    { spanInDays: 46, expected: 'week' },
    { spanInDays: 420, expected: 'week' },
    { spanInDays: 421, expected: 'month' },
    { spanInDays: 2920, expected: 'month' },
    { spanInDays: 2921, expected: 'year' },
  ])('draws a chat of $spanInDays days by $expected', ({ spanInDays, expected }) => {
    expect(chooseTimelineGranularity(spanInDays)).toBe(expected);
  });
});

describe('floorToBucketStart', () => {
  /** A Wednesday afternoon. */
  const wednesdayAfternoon = localTime('2024-01-10 15:04');

  it('floors to midnight of the same day', () => {
    expect(floorToBucketStart(wednesdayAfternoon, 'day')).toEqual(localMidnight('2024-01-10'));
  });

  it('floors to midnight of the Monday of that week', () => {
    expect(floorToBucketStart(wednesdayAfternoon, 'week')).toEqual(localMidnight('2024-01-08'));
  });

  it('counts Sunday as the last day of the week, not the first', () => {
    const sundayEvening = localTime('2024-01-14 23:59');

    expect(floorToBucketStart(sundayEvening, 'week')).toEqual(localMidnight('2024-01-08'));
  });

  it('leaves a Monday in its own week', () => {
    const mondayMorning = localTime('2024-01-08 00:00');

    expect(floorToBucketStart(mondayMorning, 'week')).toEqual(localMidnight('2024-01-08'));
  });

  it('reaches back into the previous year for a week that straddles New Year', () => {
    const newYearsDay = localTime('2025-01-01 12:00');

    expect(floorToBucketStart(newYearsDay, 'week')).toEqual(localMidnight('2024-12-30'));
  });

  it('floors to the first of the month', () => {
    expect(floorToBucketStart(wednesdayAfternoon, 'month')).toEqual(localMidnight('2024-01-01'));
  });

  it('floors to the first of January', () => {
    const inNovember = localTime('2024-11-20 08:00');

    expect(floorToBucketStart(inNovember, 'year')).toEqual(localMidnight('2024-01-01'));
  });

  it('does not change the moment it was given', () => {
    const moment = localTime('2024-01-10 15:04');

    floorToBucketStart(moment, 'week');

    expect(moment).toEqual(localTime('2024-01-10 15:04'));
  });
});

describe('nextBucketStart', () => {
  it.each([
    { granularity: 'day' as const, from: '2024-01-31', expected: '2024-02-01' },
    { granularity: 'day' as const, from: '2024-02-28', expected: '2024-02-29' },
    { granularity: 'week' as const, from: '2024-12-30', expected: '2025-01-06' },
    { granularity: 'month' as const, from: '2024-12-01', expected: '2025-01-01' },
    { granularity: 'year' as const, from: '2024-01-01', expected: '2025-01-01' },
  ])('steps one $granularity from $from to $expected', ({ granularity, from, expected }) => {
    expect(nextBucketStart(localMidnight(from), granularity)).toEqual(localMidnight(expected));
  });

  it('returns a new date and leaves the given one alone', () => {
    const bucketStart = localMidnight('2024-01-31');

    const following = nextBucketStart(bucketStart, 'day');

    expect(following).not.toBe(bucketStart);
    expect(bucketStart).toEqual(localMidnight('2024-01-31'));
  });
});

describe('buildTimelineData', () => {
  describe('buckets', () => {
    it('makes one bucket per day for a short chat, including the days without messages', () => {
      const timeline = buildTimelineFor([
        textMessage({ sentAt: '2024-01-10 09:00' }),
        textMessage({ sentAt: '2024-01-13 21:00' }),
      ]);

      expect(timeline.granularity).toBe('day');
      expect(bucketStartsOf(timeline)).toEqual([
        localMidnight('2024-01-10'),
        localMidnight('2024-01-11'),
        localMidnight('2024-01-12'),
        localMidnight('2024-01-13'),
      ]);
      expect(timeline.buckets.map((bucket) => bucket.totalMessageCount)).toEqual([1, 0, 0, 1]);
    });

    it('makes one bucket for a chat of a single message', () => {
      const timeline = buildTimelineFor([textMessage({ sentAt: '2024-01-10 09:00' })]);

      expect(bucketStartsOf(timeline)).toEqual([localMidnight('2024-01-10')]);
    });

    it('makes weekly buckets that start on Mondays for a chat of a few months', () => {
      const timeline = buildTimelineFor([
        textMessage({ sentAt: '2024-01-10 09:00' }),
        textMessage({ sentAt: '2024-03-01 09:00' }),
      ]);

      expect(timeline.granularity).toBe('week');
      expect(timeline.buckets[0]?.start).toEqual(localMidnight('2024-01-08'));
      expect(timeline.buckets[timeline.buckets.length - 1]?.start).toEqual(
        localMidnight('2024-02-26'),
      );
      expect(timeline.buckets).toHaveLength(8);
    });

    it('makes monthly buckets for a chat of a few years', () => {
      const timeline = buildTimelineFor([
        textMessage({ sentAt: '2022-11-20 09:00' }),
        textMessage({ sentAt: '2024-02-03 09:00' }),
      ]);

      expect(timeline.granularity).toBe('month');
      expect(timeline.buckets).toHaveLength(16);
      expect(timeline.buckets[0]?.start).toEqual(localMidnight('2022-11-01'));
    });

    it('makes yearly buckets for a chat of a decade', () => {
      const timeline = buildTimelineFor([
        textMessage({ sentAt: '2014-06-01 09:00' }),
        textMessage({ sentAt: '2024-02-03 09:00' }),
      ]);

      expect(timeline.granularity).toBe('year');
      expect(timeline.buckets).toHaveLength(11);
    });

    it('counts messages late on a day in that day, not the next', () => {
      const timeline = buildTimelineFor([
        textMessage({ sentAt: '2024-01-10 23:59:59' }),
        textMessage({ sentAt: '2024-01-11 00:00:00' }),
      ]);

      expect(timeline.buckets.map((bucket) => bucket.totalMessageCount)).toEqual([1, 1]);
    });
  });

  describe('series', () => {
    it('makes one series per person, the most talkative first, in their colours', () => {
      const timeline = buildTimelineFor([
        textMessage({ sender: 'Bob', sentAt: '2024-01-10 09:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-10 09:01' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-10 09:02' }),
      ]);

      expect(timeline.series).toEqual([
        { label: 'Ana', colour: 'var(--s1)' },
        { label: 'Bob', colour: 'var(--s2)' },
      ]);
    });

    it('splits the count of each bucket by series', () => {
      const timeline = buildTimelineFor([
        textMessage({ sender: 'Ana', sentAt: '2024-01-10 09:00' }),
        textMessage({ sender: 'Ana', sentAt: '2024-01-10 09:01' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-10 09:02' }),
        textMessage({ sender: 'Bob', sentAt: '2024-01-11 09:00' }),
      ]);

      expect(timeline.buckets.map((bucket) => bucket.messageCountsBySeries)).toEqual([
        [2, 1],
        [0, 1],
      ]);
    });

    it('has no "Others" series for exactly six people', () => {
      const sixPeople = ['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede'];
      const timeline = buildTimelineFor(
        sixPeople.map((sender) => textMessage({ sender, sentAt: '2024-01-10 09:00' })),
      );

      expect(timeline.series.map((series) => series.label)).toEqual(sixPeople);
    });

    describe('a group of eight', () => {
      /** Each person sends one message fewer than the one before, so the order is certain. */
      const eightPeople = ['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede', 'Gus', 'Hugo'];
      const messages = eightPeople.flatMap((sender, index) => {
        const messageCount = eightPeople.length - index;
        return Array.from({ length: messageCount }, () =>
          textMessage({ sender, sentAt: '2024-01-10 09:00' }),
        );
      });

      it('gives the six most talkative a series each and gathers the rest under "Others"', () => {
        const timeline = buildTimelineFor(messages);

        expect(timeline.series.map((series) => series.label)).toEqual([
          'Ana',
          'Bob',
          'Carla',
          'Dani',
          'Eva',
          'Fede',
          'Others',
        ]);
        expect(timeline.series[6]?.colour).toBe('var(--other)');
      });

      it('adds the messages of the seventh and eighth person together', () => {
        const timeline = buildTimelineFor(messages);

        expect(timeline.buckets[0]?.messageCountsBySeries).toEqual([8, 7, 6, 5, 4, 3, 2 + 1]);
        expect(timeline.buckets[0]?.totalMessageCount).toBe(36);
      });
    });

    it('keeps a participant who is really called "Others" apart from the grouped series', () => {
      const people = ['Others', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede', 'Gus'];
      const messages = people.flatMap((sender, index) => {
        const messageCount = people.length - index;
        return Array.from({ length: messageCount }, () =>
          textMessage({ sender, sentAt: '2024-01-10 09:00' }),
        );
      });

      const timeline = buildTimelineFor(messages);

      expect(timeline.series[0]).toEqual({ label: 'Others', colour: 'var(--s1)' });
      expect(timeline.series[6]).toEqual({ label: 'Others', colour: 'var(--other)' });
      expect(timeline.buckets[0]?.messageCountsBySeries).toEqual([7, 6, 5, 4, 3, 2, 1]);
    });
  });
});

describe('formatBucketAxisLabel', () => {
  const fifthOfMarch = localMidnight('2026-03-05');

  it.each([
    { granularity: 'day' as const, expected: '5 Mar' },
    { granularity: 'week' as const, expected: '5 Mar' },
    { granularity: 'month' as const, expected: 'Mar 26' },
    { granularity: 'year' as const, expected: '2026' },
  ])('labels a $granularity bucket as $expected', ({ granularity, expected }) => {
    expect(formatBucketAxisLabel(fifthOfMarch, granularity)).toBe(expected);
  });
});

describe('formatBucketTooltipTitle', () => {
  const fifthOfMarch = localMidnight('2026-03-05');

  it.each([
    { granularity: 'day' as const, expected: '5 Mar 2026' },
    { granularity: 'week' as const, expected: 'Week of 5 Mar 2026' },
    { granularity: 'month' as const, expected: 'Mar 2026' },
    { granularity: 'year' as const, expected: '2026' },
  ])('titles a $granularity bucket as $expected', ({ granularity, expected }) => {
    expect(formatBucketTooltipTitle(fifthOfMarch, granularity)).toBe(expected);
  });
});
