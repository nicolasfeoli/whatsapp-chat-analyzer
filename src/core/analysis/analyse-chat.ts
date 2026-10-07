/**
 * Computes everything the page draws from the messages of one chat, in a
 * single walk over the messages from oldest to newest.
 */

import {
  calendarDaysBetween,
  dayKeyFromDate,
  mondayFirstWeekdayIndexOf,
  startOfDay,
} from '../formatting';
import { DAYS_PER_WEEK, HOURS_PER_DAY, MILLISECONDS_PER_HOUR } from '../time-constants';
import type { ChatAnalysis, ChatMessage, LongestSilence, TimestampResolution } from '../types';
import { findBusiestDay, findLongestStreak, keepLongerSilence } from './activity-records';
import {
  createPersonStatisticsAccumulator,
  incrementCount,
  recordTextMessage,
  sortPeopleByMessageCount,
} from './person-statistics';
import type { PersonStatisticsAccumulator } from './person-statistics';
import { analyseMessageText } from './text-statistics';

/**
 * A message that arrives after this much silence opens a new conversation.
 * Eight hours is roughly a night's sleep: "good morning" starts a conversation,
 * an answer after lunch continues one.
 */
const CONVERSATION_BREAK_IN_MILLISECONDS = 8 * MILLISECONDS_PER_HOUR;

/**
 * An answer only counts as a reply when it comes within this time. Beyond
 * twelve hours the person was asleep or away, and counting the wait would turn
 * "typical time to reply" into a measure of sleeping habits.
 */
const LONGEST_REPLY_DELAY_IN_MILLISECONDS = 12 * MILLISECONDS_PER_HOUR;

/** Messages sent before this hour (midnight to 04:59) count as night messages. */
const NIGHT_END_HOUR = 5;

/** The totals that belong to the chat as a whole while the messages are walked. */
interface ChatTotals {
  readonly peopleByName: Map<string, PersonStatisticsAccumulator>;
  readonly weekdayHourHeatmap: number[][];
  readonly messageCountsByDayKey: Map<number, number>;
  readonly emojiCounts: Map<string, number>;
  readonly wordCounts: Map<string, number>;
  longestMessage: ChatMessage | null;
  longestMessageWordCount: number;
  longestSilence: LongestSilence | null;
  conversationCount: number;
}

/**
 * Creates the empty heatmap: seven rows of twenty-four zeroes.
 */
function createEmptyWeekdayHourHeatmap(): number[][] {
  return Array.from({ length: DAYS_PER_WEEK }, () => new Array<number>(HOURS_PER_DAY).fill(0));
}

/**
 * Creates the totals of a chat nobody has spoken in yet.
 */
function createChatTotals(): ChatTotals {
  return {
    peopleByName: new Map<string, PersonStatisticsAccumulator>(),
    weekdayHourHeatmap: createEmptyWeekdayHourHeatmap(),
    messageCountsByDayKey: new Map<number, number>(),
    emojiCounts: new Map<string, number>(),
    wordCounts: new Map<string, number>(),
    longestMessage: null,
    longestMessageWordCount: 0,
    longestSilence: null,
    conversationCount: 0,
  };
}

/**
 * Returns a copy of the messages sorted from oldest to newest. The sort is
 * stable, so messages with the same timestamp keep their order in the file.
 */
function sortMessagesChronologically(messages: readonly ChatMessage[]): ChatMessage[] {
  return [...messages].sort(
    (firstMessage, secondMessage) =>
      firstMessage.timestamp.getTime() - secondMessage.timestamp.getTime(),
  );
}

/**
 * Looks up the totals of a sender, creating them on the first message.
 */
function getOrCreatePerson(totals: ChatTotals, sender: string): PersonStatisticsAccumulator {
  const existingPerson = totals.peopleByName.get(sender);
  if (existingPerson !== undefined) {
    return existingPerson;
  }

  const newPerson = createPersonStatisticsAccumulator(sender);
  totals.peopleByName.set(sender, newPerson);
  return newPerson;
}

/**
 * Counts a message towards the hour of the week and the calendar day it was
 * sent on, and towards its sender's night messages.
 */
function recordWhenMessageWasSent(
  totals: ChatTotals,
  person: PersonStatisticsAccumulator,
  timestamp: Date,
): void {
  const hour = timestamp.getHours();

  const weekdayRow = totals.weekdayHourHeatmap[mondayFirstWeekdayIndexOf(timestamp)];
  if (weekdayRow !== undefined) {
    weekdayRow[hour] = (weekdayRow[hour] ?? 0) + 1;
  }
  if (hour < NIGHT_END_HOUR) {
    person.nightMessageCount += 1;
  }
  incrementCount(totals.messageCountsByDayKey, dayKeyFromDate(timestamp));
}

/**
 * Updates everything that depends on the message before this one: who opened
 * the conversation, how long the reply took, the longest silence, and turns.
 */
function recordConversationFlow(
  totals: ChatTotals,
  person: PersonStatisticsAccumulator,
  message: ChatMessage,
  previousMessage: ChatMessage | null,
): void {
  if (previousMessage === null) {
    person.conversationsStartedCount += 1;
    person.turnCount += 1;
    totals.conversationCount += 1;
    return;
  }

  const gapInMilliseconds = message.timestamp.getTime() - previousMessage.timestamp.getTime();
  if (gapInMilliseconds >= CONVERSATION_BREAK_IN_MILLISECONDS) {
    person.conversationsStartedCount += 1;
    totals.conversationCount += 1;
  }

  totals.longestSilence = keepLongerSilence(totals.longestSilence, previousMessage, message);

  const isFromSomeoneElse = previousMessage.sender !== message.sender;
  if (!isFromSomeoneElse) {
    return;
  }
  person.turnCount += 1;

  const isWithinReplyWindow =
    gapInMilliseconds >= 0 && gapInMilliseconds < LONGEST_REPLY_DELAY_IN_MILLISECONDS;
  if (isWithinReplyWindow) {
    person.replyDelaysInMilliseconds.push(gapInMilliseconds);
  }
}

/**
 * Counts the content of a message: a media placeholder, a deleted tombstone,
 * or the links, emojis and words of typed text.
 */
function recordMessageContent(
  totals: ChatTotals,
  person: PersonStatisticsAccumulator,
  message: ChatMessage,
): void {
  if (message.kind === 'media') {
    person.mediaCount += 1;
    return;
  }
  if (message.kind === 'deleted') {
    person.deletedCount += 1;
    return;
  }

  const textStatistics = analyseMessageText(message.text);
  recordTextMessage(person, textStatistics);

  for (const emoji of textStatistics.emojis) {
    incrementCount(totals.emojiCounts, emoji);
  }
  for (const word of textStatistics.significantWords) {
    incrementCount(totals.wordCounts, word);
  }
  if (textStatistics.wordCount > totals.longestMessageWordCount) {
    totals.longestMessageWordCount = textStatistics.wordCount;
    totals.longestMessage = message;
  }
}

/**
 * Walks the messages from oldest to newest and adds each one to the totals of
 * the chat and of its sender.
 *
 * @param chronologicalMessages - The messages, oldest first.
 * @returns The totals after the last message.
 */
function accumulateChatTotals(chronologicalMessages: readonly ChatMessage[]): ChatTotals {
  const totals = createChatTotals();
  let previousMessage: ChatMessage | null = null;

  for (const message of chronologicalMessages) {
    const person = getOrCreatePerson(totals, message.sender);
    person.messageCount += 1;

    recordWhenMessageWasSent(totals, person, message.timestamp);
    recordConversationFlow(totals, person, message, previousMessage);
    recordMessageContent(totals, person, message);

    previousMessage = message;
  }

  return totals;
}

/**
 * Assembles the result from the totals, adding the figures that can only be
 * known once every message has been counted: the ranking of people, the
 * streak, the busiest day and the span of the chat.
 *
 * @param totals - The totals after the last message.
 * @param chronologicalMessages - The messages, oldest first.
 * @param firstMessage - The oldest message.
 * @param lastMessage - The newest message.
 * @param timestampResolution - Passed through to the result.
 * @throws Error when the totals contradict themselves, which no input can cause.
 */
function buildChatAnalysis(
  totals: ChatTotals,
  chronologicalMessages: readonly ChatMessage[],
  firstMessage: ChatMessage,
  lastMessage: ChatMessage,
  timestampResolution: TimestampResolution,
): ChatAnalysis {
  const longestStreak = findLongestStreak(totals.messageCountsByDayKey);
  const busiestDay = findBusiestDay(totals.messageCountsByDayKey);
  if (longestStreak === null || busiestDay === null) {
    /* Unreachable: every counted message marks its day as active. */
    throw new Error('Invariant violated: messages were counted but no day is active.');
  }

  const firstDay = startOfDay(firstMessage.timestamp);
  const lastDay = startOfDay(lastMessage.timestamp);

  return {
    messages: chronologicalMessages,
    people: sortPeopleByMessageCount(totals.peopleByName.values()),
    weekdayHourHeatmap: totals.weekdayHourHeatmap,
    messageCountsByDayKey: totals.messageCountsByDayKey,
    emojiCounts: totals.emojiCounts,
    wordCounts: totals.wordCounts,
    longestMessage: totals.longestMessage,
    longestMessageWordCount: totals.longestMessageWordCount,
    longestSilence: totals.longestSilence,
    longestStreak,
    busiestDay,
    firstMessageTimestamp: firstMessage.timestamp,
    lastMessageTimestamp: lastMessage.timestamp,
    spanInDays: calendarDaysBetween(firstDay, lastDay) + 1,
    activeDayCount: totals.messageCountsByDayKey.size,
    conversationCount: totals.conversationCount,
    totalMessageCount: chronologicalMessages.length,
    timestampResolution,
  };
}

/**
 * Analyses the messages of one chat.
 *
 * The input is not modified; the result carries its own chronologically sorted
 * copy of the list. Messages are sorted because exports are not strictly in
 * order: phones disagree about the time, and pasted or time-zone-shifted
 * messages appear out of place.
 *
 * @param messages - The messages of the chat in any order. Must not be empty.
 * @param timestampResolution - Whether the export records seconds or only
 *   minutes (from `ParsedChat.timestampResolution`); passed through to the
 *   result so the page can round reply times honestly.
 * @returns Every number, ranking and record the page draws.
 * @throws RangeError when `messages` is empty, because a chat without messages
 *   has no first day, no busiest day and nothing else to report.
 */
export function analyseChat(
  messages: readonly ChatMessage[],
  timestampResolution: TimestampResolution,
): ChatAnalysis {
  const chronologicalMessages = sortMessagesChronologically(messages);
  const firstMessage = chronologicalMessages[0];
  const lastMessage = chronologicalMessages[chronologicalMessages.length - 1];
  if (firstMessage === undefined || lastMessage === undefined) {
    throw new RangeError('Cannot analyse a chat without messages.');
  }

  const totals = accumulateChatTotals(chronologicalMessages);
  return buildChatAnalysis(
    totals,
    chronologicalMessages,
    firstMessage,
    lastMessage,
    timestampResolution,
  );
}
