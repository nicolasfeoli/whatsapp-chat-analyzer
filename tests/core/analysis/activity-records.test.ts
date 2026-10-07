import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  findBusiestDay,
  findLongestStreak,
  keepLongerSilence,
} from '../../../src/core/analysis/activity-records';
import { MILLISECONDS_PER_HOUR } from '../../../src/core/time-constants';
import type { ChatMessage, LongestSilence } from '../../../src/core/types';
import { localMidnight, localTime, textMessage } from '../../fixtures/messages';

/**
 * Builds the messages-per-day map from day keys, with one message on each day.
 * Keys are given in the order the analysis would insert them.
 */
function oneMessageOnEachOf(dayKeys: readonly number[]): Map<number, number> {
  return new Map(dayKeys.map((dayKey) => [dayKey, 1]));
}

describe('findLongestStreak', () => {
  it('returns null when no day is active', () => {
    expect(findLongestStreak(new Map<number, number>())).toBeNull();
  });

  it('reports a streak of one day for a single active day', () => {
    const streak = findLongestStreak(oneMessageOnEachOf([20240113]));

    expect(streak).toEqual({
      lengthInDays: 1,
      from: localMidnight('2024-01-13'),
      to: localMidnight('2024-01-13'),
    });
  });

  it('counts consecutive days as one streak', () => {
    const streak = findLongestStreak(oneMessageOnEachOf([20240113, 20240114, 20240115]));

    expect(streak).toEqual({
      lengthInDays: 3,
      from: localMidnight('2024-01-13'),
      to: localMidnight('2024-01-15'),
    });
  });

  it('breaks the streak at a day without messages', () => {
    const streak = findLongestStreak(oneMessageOnEachOf([20240113, 20240114, 20240116]));

    expect(streak?.lengthInDays).toBe(2);
  });

  it('finds the longest of several streaks', () => {
    const dayKeys = [20240101, 20240102, 20240110, 20240111, 20240112, 20240113, 20240120];

    const streak = findLongestStreak(oneMessageOnEachOf(dayKeys));

    expect(streak).toEqual({
      lengthInDays: 4,
      from: localMidnight('2024-01-10'),
      to: localMidnight('2024-01-13'),
    });
  });

  it('keeps the earliest of several equally long streaks', () => {
    const dayKeys = [20240101, 20240102, 20240110, 20240111];

    const streak = findLongestStreak(oneMessageOnEachOf(dayKeys));

    expect(streak?.from).toEqual(localMidnight('2024-01-01'));
  });

  it('continues a streak from the last day of a month into the next', () => {
    const streak = findLongestStreak(oneMessageOnEachOf([20240131, 20240201]));

    expect(streak?.lengthInDays).toBe(2);
  });

  it('continues a streak across the leap day', () => {
    const streak = findLongestStreak(oneMessageOnEachOf([20240228, 20240229, 20240301]));

    expect(streak?.lengthInDays).toBe(3);
  });

  it('continues a streak from New Year’s Eve into the new year', () => {
    const streak = findLongestStreak(oneMessageOnEachOf([20231231, 20240101]));

    expect(streak).toEqual({
      lengthInDays: 2,
      from: localMidnight('2023-12-31'),
      to: localMidnight('2024-01-01'),
    });
  });

  it('sorts the days itself, so the order of the map does not matter', () => {
    const streak = findLongestStreak(oneMessageOnEachOf([20240115, 20240113, 20240114]));

    expect(streak?.lengthInDays).toBe(3);
  });

  it('counts a day once, however many messages it has', () => {
    const messageCountsByDayKey = new Map([
      [20240113, 40],
      [20240114, 1],
    ]);

    expect(findLongestStreak(messageCountsByDayKey)?.lengthInDays).toBe(2);
  });

  describe('in a time zone that changes its clocks', () => {
    const originalTimeZone = process.env['TZ'];

    beforeAll(() => {
      /* Madrid moved its clocks forward on 31 March 2024, a day of 23 hours. */
      process.env['TZ'] = 'Europe/Madrid';
    });

    afterAll(() => {
      if (originalTimeZone === undefined) {
        delete process.env['TZ'];
      } else {
        process.env['TZ'] = originalTimeZone;
      }
    });

    it('does not break a streak on the day the clocks change', () => {
      const streak = findLongestStreak(oneMessageOnEachOf([20240330, 20240331, 20240401]));

      expect(streak?.lengthInDays).toBe(3);
    });
  });
});

describe('findBusiestDay', () => {
  it('returns null when no day is active', () => {
    expect(findBusiestDay(new Map<number, number>())).toBeNull();
  });

  it('returns the day with the most messages', () => {
    const messageCountsByDayKey = new Map([
      [20240113, 4],
      [20240114, 12],
      [20240115, 7],
    ]);

    expect(findBusiestDay(messageCountsByDayKey)).toEqual({
      date: localMidnight('2024-01-14'),
      messageCount: 12,
    });
  });

  it('keeps the first of several equally busy days', () => {
    const messageCountsByDayKey = new Map([
      [20240113, 5],
      [20240114, 5],
    ]);

    expect(findBusiestDay(messageCountsByDayKey)?.date).toEqual(localMidnight('2024-01-13'));
  });

  it('returns the only day of a one-day chat', () => {
    const messageCountsByDayKey = new Map([[20240113, 1]]);

    expect(findBusiestDay(messageCountsByDayKey)).toEqual({
      date: localMidnight('2024-01-13'),
      messageCount: 1,
    });
  });
});

describe('keepLongerSilence', () => {
  let messageAtTen: ChatMessage;
  let messageAtOne: ChatMessage;

  beforeEach(() => {
    messageAtTen = textMessage({ sender: 'Ana', sentAt: '2024-01-13 10:00' });
    messageAtOne = textMessage({ sender: 'Bob', sentAt: '2024-01-13 13:00' });
  });

  it('records the gap between two messages when there is no record yet', () => {
    expect(keepLongerSilence(null, messageAtTen, messageAtOne)).toEqual({
      durationInMilliseconds: 3 * MILLISECONDS_PER_HOUR,
      from: localTime('2024-01-13 10:00'),
      to: localTime('2024-01-13 13:00'),
    });
  });

  it('replaces the record with a longer gap', () => {
    const record: LongestSilence = {
      durationInMilliseconds: MILLISECONDS_PER_HOUR,
      from: localTime('2024-01-12 08:00'),
      to: localTime('2024-01-12 09:00'),
    };

    const newRecord = keepLongerSilence(record, messageAtTen, messageAtOne);

    expect(newRecord?.durationInMilliseconds).toBe(3 * MILLISECONDS_PER_HOUR);
  });

  it('keeps the record when the gap is shorter', () => {
    const record: LongestSilence = {
      durationInMilliseconds: 5 * MILLISECONDS_PER_HOUR,
      from: localTime('2024-01-12 08:00'),
      to: localTime('2024-01-12 13:00'),
    };

    expect(keepLongerSilence(record, messageAtTen, messageAtOne)).toBe(record);
  });

  it('keeps the earlier record when the gap is exactly as long', () => {
    const record: LongestSilence = {
      durationInMilliseconds: 3 * MILLISECONDS_PER_HOUR,
      from: localTime('2024-01-12 08:00'),
      to: localTime('2024-01-12 11:00'),
    };

    expect(keepLongerSilence(record, messageAtTen, messageAtOne)).toBe(record);
  });

  it('records no silence between two messages sent at the same moment', () => {
    expect(keepLongerSilence(null, messageAtTen, messageAtTen)).toBeNull();
  });

  it('records no silence when the second message is dated before the first', () => {
    expect(keepLongerSilence(null, messageAtOne, messageAtTen)).toBeNull();
  });
});
