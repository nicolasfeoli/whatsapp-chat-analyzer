/**
 * The records of a chat's calendar: its longest streak of active days, its
 * busiest day and its longest silence.
 */

import { calendarDaysBetween, dateFromDayKey } from '../formatting';
import type { BusiestDay, ChatMessage, LongestSilence, LongestStreak } from '../types';

/**
 * Finds the longest run of consecutive calendar days with at least one message.
 * When several runs are equally long, the earliest wins.
 *
 * @param messageCountsByDayKey - Messages per day, keyed by `YYYYMMDD`.
 * @returns The longest run, or `null` when there is no active day at all.
 */
export function findLongestStreak(
  messageCountsByDayKey: ReadonlyMap<number, number>,
): LongestStreak | null {
  const chronologicalDayKeys = [...messageCountsByDayKey.keys()].sort(
    (firstDayKey, secondDayKey) => firstDayKey - secondDayKey,
  );

  let longestStreak: LongestStreak | null = null;
  let currentStreakLength = 0;
  let currentStreakStart: Date | null = null;
  let previousDay: Date | null = null;

  for (const dayKey of chronologicalDayKeys) {
    const day = dateFromDayKey(dayKey);
    const followsPreviousDay = previousDay !== null && calendarDaysBetween(previousDay, day) === 1;

    if (followsPreviousDay && currentStreakStart !== null) {
      currentStreakLength += 1;
    } else {
      currentStreakLength = 1;
      currentStreakStart = day;
    }

    if (longestStreak === null || currentStreakLength > longestStreak.lengthInDays) {
      longestStreak = { lengthInDays: currentStreakLength, from: currentStreakStart, to: day };
    }
    previousDay = day;
  }

  return longestStreak;
}

/**
 * Finds the calendar day with the most messages. When several days tie, the
 * one that comes first in the map wins.
 *
 * @param messageCountsByDayKey - Messages per day, keyed by `YYYYMMDD`.
 * @returns The busiest day, or `null` when there is no active day at all.
 */
export function findBusiestDay(
  messageCountsByDayKey: ReadonlyMap<number, number>,
): BusiestDay | null {
  let busiestDayKey: number | null = null;
  let busiestDayMessageCount = 0;

  for (const [dayKey, messageCount] of messageCountsByDayKey) {
    if (messageCount > busiestDayMessageCount) {
      busiestDayKey = dayKey;
      busiestDayMessageCount = messageCount;
    }
  }

  if (busiestDayKey === null) {
    return null;
  }
  return { date: dateFromDayKey(busiestDayKey), messageCount: busiestDayMessageCount };
}

/**
 * Keeps whichever is longer: the longest silence found so far, or the gap
 * between two consecutive messages. An equally long later gap does not replace
 * an earlier one.
 *
 * @param longestSilenceSoFar - The record before this pair of messages, or `null`.
 * @param previousMessage - The earlier of two consecutive messages.
 * @param currentMessage - The later of the two.
 * @returns The record after considering this pair.
 */
export function keepLongerSilence(
  longestSilenceSoFar: LongestSilence | null,
  previousMessage: ChatMessage,
  currentMessage: ChatMessage,
): LongestSilence | null {
  const gapInMilliseconds =
    currentMessage.timestamp.getTime() - previousMessage.timestamp.getTime();
  const longestDurationSoFar = longestSilenceSoFar?.durationInMilliseconds ?? 0;

  if (gapInMilliseconds <= longestDurationSoFar) {
    return longestSilenceSoFar;
  }
  return {
    durationInMilliseconds: gapInMilliseconds,
    from: previousMessage.timestamp,
    to: currentMessage.timestamp,
  };
}
