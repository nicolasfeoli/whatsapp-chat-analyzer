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
import {
  DAYS_PER_WEEK,
  HOURS_PER_DAY,
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_HOUR,
} from '../time-constants';
import type { ChatAnalysis, ChatMessage, LongestSilence, TimestampResolution } from '../types';
import { findBusiestDay, findLongestStreak, keepLongerSilence } from './activity-records';
import { identifyMediaType } from './media-type';
import {
  createPersonStatisticsAccumulator,
  incrementCount,
  recordCaption,
  recordHourAndWeekday,
  recordTextMessage,
  sortPeopleByMessageCount,
} from './person-statistics';
import type { PersonStatisticsAccumulator } from './person-statistics';
import { findSignaturePhrases } from './signature-phrases';
import { analyseMessageText } from './text-statistics';
import type { MessageTextStatistics } from './text-statistics';

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

/**
 * "Then and now" compares the first year of a chat with its latest year. A
 * chat shorter than two years is split in two halves instead, so the two
 * periods never overlap.
 */
const LONGEST_COMPARISON_PERIOD_IN_DAYS = 365;

/**
 * A chat shorter than this is not compared at all: its two halves would be a
 * few weeks each, and who wrote more in which of them is mostly chance.
 */
const SHORTEST_COMPARABLE_SPAN_IN_DAYS = 60;

/**
 * The two stretches of time compared in "then and now". Both have the same
 * length; a message sent before `earlyPeriodEnd` belongs to the first, one
 * sent at or after `recentPeriodStart` to the last.
 */
interface ComparisonPeriods {
  /** The length of each period in whole days; zero when the chat is too short to compare. */
  readonly lengthInDays: number;
  /** `getTime()` of the end of the first period; nothing is earlier when there is no comparison. */
  readonly earlyPeriodEnd: number;
  /** `getTime()` of the start of the last period; nothing is later when there is no comparison. */
  readonly recentPeriodStart: number;
}

/** The totals that belong to the chat as a whole while the messages are walked. */
interface ChatTotals {
  readonly peopleByName: Map<string, PersonStatisticsAccumulator>;
  readonly weekdayHourHeatmap: number[][];
  readonly messageCountsByDayKey: Map<number, number>;
  readonly emojiCounts: Map<string, number>;
  readonly wordCounts: Map<string, number>;
  /** How often each phrase occurs in the whole chat. Reduced to a few per person before it is handed out. */
  readonly phraseCounts: Map<string, number>;
  /** How often each person used each phrase, by the person's name. */
  readonly phraseCountsByName: Map<string, Map<string, number>>;
  longestMessage: ChatMessage | null;
  longestMessageWordCount: number;
  longestSilence: LongestSilence | null;
  conversationCount: number;
  /**
   * Questions asked so far in the turn that is still open: the run of messages
   * from the latest sender since somebody else last wrote. They are counted
   * as unanswered when the conversation ends before anybody else writes.
   */
  questionCountInOpenTurn: number;
}

/** A message that has been counted, together with the totals of its sender. */
interface CountedMessage {
  readonly message: ChatMessage;
  readonly sender: PersonStatisticsAccumulator;
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
    phraseCounts: new Map<string, number>(),
    phraseCountsByName: new Map<string, Map<string, number>>(),
    longestMessage: null,
    longestMessageWordCount: 0,
    longestSilence: null,
    conversationCount: 0,
    questionCountInOpenTurn: 0,
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
 * Works out the two periods compared in "then and now" from the first and the
 * last moment of the chat.
 *
 * @param firstTimestamp - When the oldest message was sent.
 * @param lastTimestamp - When the newest message was sent.
 * @returns The periods; of length zero when the chat is too short to compare.
 */
function findComparisonPeriods(firstTimestamp: Date, lastTimestamp: Date): ComparisonPeriods {
  const spanInMilliseconds = lastTimestamp.getTime() - firstTimestamp.getTime();
  const spanInDays = spanInMilliseconds / MILLISECONDS_PER_DAY;
  if (spanInDays < SHORTEST_COMPARABLE_SPAN_IN_DAYS) {
    return { lengthInDays: 0, earlyPeriodEnd: -Infinity, recentPeriodStart: Infinity };
  }

  const lengthInDays = Math.min(LONGEST_COMPARISON_PERIOD_IN_DAYS, Math.floor(spanInDays / 2));
  const lengthInMilliseconds = lengthInDays * MILLISECONDS_PER_DAY;
  return {
    lengthInDays,
    earlyPeriodEnd: firstTimestamp.getTime() + lengthInMilliseconds,
    recentPeriodStart: lastTimestamp.getTime() - lengthInMilliseconds,
  };
}

/**
 * Counts a message towards its sender's early or recent messages when it was
 * sent in the first or the last comparison period.
 */
function recordComparisonPeriod(
  person: PersonStatisticsAccumulator,
  timestamp: Date,
  comparisonPeriods: ComparisonPeriods,
): void {
  const time = timestamp.getTime();
  if (time < comparisonPeriods.earlyPeriodEnd) {
    person.earlyMessageCount += 1;
  }
  if (time >= comparisonPeriods.recentPeriodStart) {
    person.recentMessageCount += 1;
  }
}

/**
 * Looks up the phrase table of a sender, creating it on their first phrase.
 */
function getOrCreatePhraseCounts(totals: ChatTotals, sender: string): Map<string, number> {
  const existingPhraseCounts = totals.phraseCountsByName.get(sender);
  if (existingPhraseCounts !== undefined) {
    return existingPhraseCounts;
  }

  const newPhraseCounts = new Map<string, number>();
  totals.phraseCountsByName.set(sender, newPhraseCounts);
  return newPhraseCounts;
}

/**
 * Counts the emojis, words and phrases of something a person typed towards
 * the tables of the whole chat and the phrase table of that person.
 */
function recordTypedTextInChatTables(
  totals: ChatTotals,
  sender: string,
  textStatistics: MessageTextStatistics,
): void {
  for (const emoji of textStatistics.emojis) {
    incrementCount(totals.emojiCounts, emoji);
  }
  for (const word of textStatistics.significantWords) {
    incrementCount(totals.wordCounts, word);
  }
  if (textStatistics.phrases.length === 0) {
    return;
  }
  const personPhraseCounts = getOrCreatePhraseCounts(totals, sender);
  for (const phrase of textStatistics.phrases) {
    incrementCount(totals.phraseCounts, phrase);
    incrementCount(personPhraseCounts, phrase);
  }
}

/**
 * Counts a message towards the hour of the week and the calendar day it was
 * sent on, and towards its sender's hours, weekdays and night messages.
 */
function recordWhenMessageWasSent(
  totals: ChatTotals,
  person: PersonStatisticsAccumulator,
  timestamp: Date,
): void {
  const hour = timestamp.getHours();
  const weekdayIndex = mondayFirstWeekdayIndexOf(timestamp);

  const weekdayRow = totals.weekdayHourHeatmap[weekdayIndex];
  if (weekdayRow !== undefined) {
    weekdayRow[hour] = (weekdayRow[hour] ?? 0) + 1;
  }
  recordHourAndWeekday(person, hour, weekdayIndex);
  if (hour < NIGHT_END_HOUR) {
    person.nightMessageCount += 1;
  }
  incrementCount(totals.messageCountsByDayKey, dayKeyFromDate(timestamp));
}

/**
 * Closes the conversation that the long silence has just ended: whoever wrote
 * last had the last word, and the questions of their closing turn went
 * unanswered.
 */
function recordConversationEnd(totals: ChatTotals, lastSpeaker: PersonStatisticsAccumulator): void {
  lastSpeaker.conversationsEndedCount += 1;
  lastSpeaker.unansweredQuestionCount += totals.questionCountInOpenTurn;
  totals.questionCountInOpenTurn = 0;
}

/**
 * Updates everything that depends on the message before this one: who opened
 * and who closed the conversation, who replied to whom and how long it took,
 * the longest silence, and turns.
 */
function recordConversationFlow(
  totals: ChatTotals,
  person: PersonStatisticsAccumulator,
  message: ChatMessage,
  previous: CountedMessage | null,
): void {
  if (previous === null) {
    person.conversationsStartedCount += 1;
    person.turnCount += 1;
    totals.conversationCount += 1;
    return;
  }

  const gapInMilliseconds = message.timestamp.getTime() - previous.message.timestamp.getTime();
  if (gapInMilliseconds >= CONVERSATION_BREAK_IN_MILLISECONDS) {
    person.conversationsStartedCount += 1;
    totals.conversationCount += 1;
    recordConversationEnd(totals, previous.sender);
  }

  totals.longestSilence = keepLongerSilence(totals.longestSilence, previous.message, message);

  const isFromSomeoneElse = previous.sender !== person;
  if (!isFromSomeoneElse) {
    return;
  }
  person.turnCount += 1;
  totals.questionCountInOpenTurn = 0;

  const isWithinReplyWindow =
    gapInMilliseconds >= 0 && gapInMilliseconds < LONGEST_REPLY_DELAY_IN_MILLISECONDS;
  if (isWithinReplyWindow) {
    person.replyDelaysInMilliseconds.push(gapInMilliseconds);
    incrementCount(person.replyCountsByRecipient, previous.sender.name);
  }
}

/**
 * Counts the content of a message: a media placeholder with the words of its
 * caption, a deleted tombstone, or the links, emojis and words of typed text.
 * A typed question is also added to the questions of the open turn.
 */
function recordMessageContent(
  totals: ChatTotals,
  person: PersonStatisticsAccumulator,
  message: ChatMessage,
): void {
  if (message.kind === 'media') {
    person.mediaCount += 1;
    incrementCount(person.mediaCountsByType, identifyMediaType(message.text));
    if (message.caption !== '') {
      const captionStatistics = analyseMessageText(message.caption);
      recordCaption(person, captionStatistics);
      recordTypedTextInChatTables(totals, message.sender, captionStatistics);
    }
    return;
  }
  if (message.kind === 'deleted') {
    person.deletedCount += 1;
    return;
  }

  const textStatistics = analyseMessageText(message.text);
  recordTextMessage(person, textStatistics);
  if (textStatistics.containsQuestion) {
    totals.questionCountInOpenTurn += 1;
  }

  recordTypedTextInChatTables(totals, message.sender, textStatistics);
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
 * @param comparisonPeriods - The two periods compared in "then and now".
 * @returns The totals after the last message.
 */
function accumulateChatTotals(
  chronologicalMessages: readonly ChatMessage[],
  comparisonPeriods: ComparisonPeriods,
): ChatTotals {
  const totals = createChatTotals();
  let previous: CountedMessage | null = null;

  for (const message of chronologicalMessages) {
    const person = getOrCreatePerson(totals, message.sender);
    person.messageCount += 1;

    recordWhenMessageWasSent(totals, person, message.timestamp);
    recordComparisonPeriod(person, message.timestamp, comparisonPeriods);
    recordConversationFlow(totals, person, message, previous);
    recordMessageContent(totals, person, message);

    previous = { message, sender: person };
  }

  return totals;
}

/**
 * Reduces the phrase tables to the few phrases that set each person apart and
 * stores them with the person. A chat with one sender has nobody to differ
 * from, so its only person gets none.
 */
function assignSignaturePhrases(totals: ChatTotals): void {
  const hasSeveralPeople = totals.peopleByName.size > 1;
  if (!hasSeveralPeople) {
    return;
  }
  for (const [name, personPhraseCounts] of totals.phraseCountsByName) {
    const person = getOrCreatePerson(totals, name);
    person.signaturePhrases = findSignaturePhrases(personPhraseCounts, totals.phraseCounts);
  }
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
 * @param comparisonPeriodInDays - Passed through to the result.
 * @throws Error when the totals contradict themselves, which no input can cause.
 */
function buildChatAnalysis(
  totals: ChatTotals,
  chronologicalMessages: readonly ChatMessage[],
  firstMessage: ChatMessage,
  lastMessage: ChatMessage,
  timestampResolution: TimestampResolution,
  comparisonPeriodInDays: number,
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
    comparisonPeriodInDays,
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

  const comparisonPeriods = findComparisonPeriods(firstMessage.timestamp, lastMessage.timestamp);
  const totals = accumulateChatTotals(chronologicalMessages, comparisonPeriods);
  assignSignaturePhrases(totals);
  return buildChatAnalysis(
    totals,
    chronologicalMessages,
    firstMessage,
    lastMessage,
    timestampResolution,
    comparisonPeriods.lengthInDays,
  );
}
