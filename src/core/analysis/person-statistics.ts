/**
 * The running totals kept for each participant while the messages are walked
 * once, oldest first.
 */

import type { Mutable } from '../mutable';
import type { MediaType, PersonStatistics } from '../types';
import type { MessageTextStatistics } from './text-statistics';

/**
 * {@link PersonStatistics} while it is still being counted: the same fields,
 * writable, with a plain array for the reply delays and plain maps for the
 * emoji and word counts. It is handed out as the read-only type when done.
 */
export type PersonStatisticsAccumulator = Mutable<PersonStatistics>;

/**
 * Creates the totals for a participant who has not been counted yet.
 *
 * @param name - The participant's name as written in the export.
 * @returns Totals with every count at zero.
 */
export function createPersonStatisticsAccumulator(name: string): PersonStatisticsAccumulator {
  return {
    name,
    messageCount: 0,
    textMessageCount: 0,
    mediaCount: 0,
    mediaCountsByType: new Map<MediaType, number>(),
    deletedCount: 0,
    wordCount: 0,
    emojiCount: 0,
    questionCount: 0,
    linkCount: 0,
    laughingMessageCount: 0,
    nightMessageCount: 0,
    replyDelaysInMilliseconds: [],
    conversationsStartedCount: 0,
    conversationsEndedCount: 0,
    unansweredQuestionCount: 0,
    replyCountsByRecipient: new Map<string, number>(),
    turnCount: 0,
    emojiCounts: new Map<string, number>(),
    wordCounts: new Map<string, number>(),
  };
}

/**
 * Adds one to the count stored under a key, starting from zero for a new key.
 * New keys go to the end of the map, so iteration order is order of first use.
 *
 * @param counts - The map of counts to update.
 * @param key - The emoji, word or day to count once more.
 */
export function incrementCount<Key>(counts: Map<Key, number>, key: Key): void {
  const currentCount = counts.get(key) ?? 0;
  counts.set(key, currentCount + 1);
}

/**
 * Adds what was found in the text of one typed message to a person's totals.
 *
 * @param person - The totals of the message's sender.
 * @param textStatistics - What `analyseMessageText` found in the message.
 */
export function recordTextMessage(
  person: PersonStatisticsAccumulator,
  textStatistics: MessageTextStatistics,
): void {
  person.textMessageCount += 1;
  person.linkCount += textStatistics.linkCount;
  person.wordCount += textStatistics.wordCount;
  person.emojiCount += textStatistics.emojis.length;

  if (textStatistics.containsQuestion) {
    person.questionCount += 1;
  }
  if (textStatistics.containsLaugh) {
    person.laughingMessageCount += 1;
  }
  for (const emoji of textStatistics.emojis) {
    incrementCount(person.emojiCounts, emoji);
  }
  for (const word of textStatistics.significantWords) {
    incrementCount(person.wordCounts, word);
  }
}

/**
 * Orders the participants for display: the one with the most messages first.
 * People with equally many messages stay in order of first appearance.
 *
 * @param people - The finished totals of every participant, in order of first appearance.
 * @returns A new array sorted by message count, largest first.
 */
export function sortPeopleByMessageCount(
  people: Iterable<PersonStatisticsAccumulator>,
): PersonStatistics[] {
  return [...people].sort(
    (firstPerson, secondPerson) => secondPerson.messageCount - firstPerson.messageCount,
  );
}
