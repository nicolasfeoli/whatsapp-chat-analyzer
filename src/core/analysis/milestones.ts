/**
 * The moments a chat passed: its first message, the round numbers of messages
 * it reached, the message that made half of all of them, and its latest
 * anniversary. The ones tied to a message are noticed while the messages are
 * walked once, oldest first; the anniversary follows from the first and the
 * last day.
 */

import { startOfDay } from '../formatting';
import type { AnniversaryMilestone, ChatMessage, ChatMilestone } from '../types';

/**
 * The message counts worth a line of their own. A chat that reaches the next
 * one keeps the lines of the ones before it, so the list stays short: four
 * lines for the largest chat the page can load.
 */
export const MESSAGE_COUNT_MILESTONES: readonly number[] = [1_000, 10_000, 50_000, 100_000];

/**
 * A chat needs this many messages before the day it reached half of them is
 * reported. In a chat of a dozen messages, "half" is the sixth message and
 * the day says nothing about how the chat went.
 */
export const MINIMUM_MESSAGES_FOR_HALF_MILESTONE = 100;

/**
 * Works out which message makes half of a chat.
 *
 * @param totalMessageCount - How many messages the chat has.
 * @returns The position of that message, counting from 1 (the 50th of 100,
 *   the 51st of 101), or `null` for a chat of fewer than a hundred messages.
 */
export function findHalfwayMessageNumber(totalMessageCount: number): number | null {
  if (totalMessageCount < MINIMUM_MESSAGES_FOR_HALF_MILESTONE) {
    return null;
  }
  return Math.ceil(totalMessageCount / 2);
}

/**
 * Adds the milestones a message stands for to the list: the first message,
 * a round number of messages, and half of the chat. Most messages add none.
 *
 * @param milestones - The milestones found so far; added to in place.
 * @param message - The message being counted.
 * @param messageNumber - Its position in the chat, counting from 1.
 * @param halfwayMessageNumber - The position that makes half of the chat, from
 *   {@link findHalfwayMessageNumber}; `null` when the half is not reported.
 */
export function recordMessageMilestones(
  milestones: ChatMilestone[],
  message: ChatMessage,
  messageNumber: number,
  halfwayMessageNumber: number | null,
): void {
  if (messageNumber === 1) {
    milestones.push({
      kind: 'first-message',
      timestamp: message.timestamp,
      sender: message.sender,
    });
  }
  if (MESSAGE_COUNT_MILESTONES.includes(messageNumber)) {
    milestones.push({
      kind: 'message-count',
      timestamp: message.timestamp,
      sender: message.sender,
      messageCount: messageNumber,
    });
  }
  if (messageNumber === halfwayMessageNumber) {
    milestones.push({
      kind: 'half-of-messages',
      timestamp: message.timestamp,
      messageCount: messageNumber,
    });
  }
}

/**
 * Finds the day a number of years after another day. A chat that began on
 * 29 February has its anniversary on 28 February in a year without one.
 *
 * @param firstDay - Midnight at the start of the day to count from.
 * @param years - How many years later.
 * @returns Midnight at the start of the anniversary, in local time.
 */
export function anniversaryDayOf(firstDay: Date, years: number): Date {
  const anniversaryYear = firstDay.getFullYear() + years;
  const sameDayOfMonth = new Date(anniversaryYear, firstDay.getMonth(), firstDay.getDate());
  if (sameDayOfMonth.getMonth() === firstDay.getMonth()) {
    return sameDayOfMonth;
  }
  /* The day does not exist in that year and rolled over into March: day 0 of March is the last of February. */
  return new Date(anniversaryYear, firstDay.getMonth() + 1, 0);
}

/**
 * Finds the latest anniversary of the first message that the chat lived to
 * see: the day, a whole number of years after its first day, on or before the
 * day of its last message.
 *
 * @param firstMessageTimestamp - When the oldest message was sent.
 * @param lastMessageTimestamp - When the newest message was sent.
 * @returns The anniversary, or `null` for a chat shorter than a year.
 */
export function findLatestAnniversary(
  firstMessageTimestamp: Date,
  lastMessageTimestamp: Date,
): AnniversaryMilestone | null {
  const firstDay = startOfDay(firstMessageTimestamp);
  const calendarYearsApart = lastMessageTimestamp.getFullYear() - firstDay.getFullYear();

  /* The anniversary of the last calendar year may still lie ahead of the last message. */
  const isLastOneReached =
    anniversaryDayOf(firstDay, calendarYearsApart).getTime() <= lastMessageTimestamp.getTime();
  const years = isLastOneReached ? calendarYearsApart : calendarYearsApart - 1;
  if (years < 1) {
    return null;
  }
  return { kind: 'anniversary', timestamp: anniversaryDayOf(firstDay, years), years };
}

/**
 * Finishes the list of milestones once every message has been counted: adds
 * the latest anniversary and puts everything in order of time.
 *
 * @param messageMilestones - The milestones tied to a message, oldest first.
 * @param firstMessageTimestamp - When the oldest message was sent.
 * @param lastMessageTimestamp - When the newest message was sent.
 * @returns A new list, oldest first. Milestones of the same moment keep their
 *   order, and an anniversary comes before the messages of its day.
 */
export function completeMilestones(
  messageMilestones: readonly ChatMilestone[],
  firstMessageTimestamp: Date,
  lastMessageTimestamp: Date,
): ChatMilestone[] {
  const anniversary = findLatestAnniversary(firstMessageTimestamp, lastMessageTimestamp);
  /* The sort is stable, so starting with the anniversary puts it before a message sent at its midnight. */
  const milestones: ChatMilestone[] =
    anniversary === null ? [...messageMilestones] : [anniversary, ...messageMilestones];
  return milestones.sort(
    (firstMilestone: ChatMilestone, secondMilestone: ChatMilestone): number =>
      firstMilestone.timestamp.getTime() - secondMilestone.timestamp.getTime(),
  );
}
