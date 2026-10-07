/**
 * Looking a word or a short phrase up in the messages of a chat: how many
 * messages contain it, who wrote them and in which months.
 *
 * The search reads what the word lists read: the typed text of a message and
 * the caption of a photo, without links and mentions, split into words the
 * same way. On top of that it ignores accents, so "que" finds "qué". A word
 * is only found as a whole word, and a phrase as its words one after the
 * other on one line.
 */

import type { ChatMessage } from '../types';
import { extractWords, removeLinks, removeMentions } from './text-statistics';

/** What a search found in the messages it was given. */
export interface WordSearchResult {
  /** The messages that could contain a word: typed messages and media with a caption. */
  readonly searchedMessageCount: number;
  /** The searched messages that contain the word or phrase at least once. */
  readonly matchingMessageCount: number;
  /**
   * How often the word or phrase stands in the searched messages. A message
   * that says it twice counts twice here and once in
   * {@link WordSearchResult.matchingMessageCount}.
   */
  readonly occurrenceCount: number;
  /** The searched messages of each sender, by name, in order of first message. */
  readonly searchedMessageCountsBySender: ReadonlyMap<string, number>;
  /** The matching messages of each sender who has any, by name, in order of first match. */
  readonly matchingMessageCountsBySender: ReadonlyMap<string, number>;
  /**
   * The matching messages of each calendar month that has any, in the order
   * the months occur. The key is the month written as the number `YYYYMM`
   * (see {@link monthKeyFromDate}), in local time.
   */
  readonly matchingMessageCountsByMonthKey: ReadonlyMap<number, number>;
}

/**
 * The combining marks left behind when a letter is taken apart into its base
 * letter and its accents (Unicode normalisation form D): the acute of "é",
 * the tilde of "ñ", the diaeresis of "ü".
 */
const COMBINING_MARK_PATTERN = /\p{M}/gu;

/** The factor that moves the year in front of the two digits of the month in a month key. */
const MONTH_KEY_YEAR_FACTOR = 100;

/**
 * Brings a text to the form in which the search compares: lower case, and
 * every letter without its accents. "QUÉ" and "qué" both become "que".
 *
 * @param text - Any text.
 * @returns The text in lower case without combining marks.
 */
export function normaliseForSearch(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(COMBINING_MARK_PATTERN, '');
}

/**
 * Reads what somebody typed into the search field as the words to look for.
 *
 * @param query - The text of the search field.
 * @returns The words of the query in the form the search compares, in order.
 *   Empty when the query holds no letter: digits, punctuation and emojis are
 *   not words here, as in the word lists.
 */
export function parseSearchQuery(query: string): string[] {
  return extractWords(normaliseForSearch(query));
}

/**
 * Writes the calendar month of a moment as one number.
 *
 * @param moment - Any moment.
 * @returns The month in local time as `YYYYMM`, e.g. `202403` for March 2024.
 */
export function monthKeyFromDate(moment: Date): number {
  return moment.getFullYear() * MONTH_KEY_YEAR_FACTOR + moment.getMonth() + 1;
}

/**
 * Reads the year back out of a month key.
 *
 * @param monthKey - A month written as `YYYYMM` by {@link monthKeyFromDate}.
 * @returns The year, e.g. `2024` for `202403`.
 */
export function yearFromMonthKey(monthKey: number): number {
  return Math.floor(monthKey / MONTH_KEY_YEAR_FACTOR);
}

/**
 * Finds what a person typed in a message: the text of a typed message or the
 * caption of a media message.
 *
 * @returns The typed text, or `null` for a message without any: a media
 *   placeholder without caption or a deleted message.
 */
function typedTextOf(message: ChatMessage): string | null {
  switch (message.kind) {
    case 'text':
      return message.text;
    case 'media':
      return message.caption === '' ? null : message.caption;
    case 'deleted':
      return null;
  }
}

/**
 * Tells whether the words of the query stand in a list of words from a given
 * position on.
 */
function isPhraseAt(
  words: readonly string[],
  queryWords: readonly string[],
  position: number,
): boolean {
  for (const [offset, queryWord] of queryWords.entries()) {
    if (words[position + offset] !== queryWord) {
      return false;
    }
  }
  return true;
}

/**
 * Counts how often the words of the query stand one after the other in a list
 * of words. An occurrence starts after the end of the one before, so "no no"
 * is in "no no no" once.
 */
function countPhraseInWords(words: readonly string[], queryWords: readonly string[]): number {
  let occurrenceCount = 0;
  let position = 0;
  while (position + queryWords.length <= words.length) {
    if (isPhraseAt(words, queryWords, position)) {
      occurrenceCount += 1;
      position += queryWords.length;
    } else {
      position += 1;
    }
  }
  return occurrenceCount;
}

/**
 * Counts how often a word or phrase stands in a text. Links and mentions are
 * left out first, as in the word lists, and a phrase never runs across a line
 * break.
 *
 * @param text - What a person typed: a message or a caption.
 * @param queryWords - The words to look for, from {@link parseSearchQuery}.
 * @returns The number of occurrences; zero for an empty list of words.
 */
export function countOccurrencesInText(text: string, queryWords: readonly string[]): number {
  const [firstQueryWord] = queryWords;
  if (firstQueryWord === undefined) {
    return 0;
  }
  /* Most messages do not hold the letters of the first word at all, and are done with here. */
  if (!normaliseForSearch(text).includes(firstQueryWord)) {
    return 0;
  }

  const textToSearch = normaliseForSearch(removeMentions(removeLinks(text)));
  let occurrenceCount = 0;
  for (const line of textToSearch.split('\n')) {
    occurrenceCount += countPhraseInWords(extractWords(line), queryWords);
  }
  return occurrenceCount;
}

/**
 * Adds one to the count kept under a key.
 */
function countOneMore<Key>(counts: Map<Key, number>, key: Key): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Looks a word or phrase up in messages.
 *
 * @param messages - The messages to search, in any order.
 * @param queryWords - The words to look for, from {@link parseSearchQuery}. An
 *   empty list finds nothing.
 * @returns How many messages were searched and how many contain the words,
 *   in all, by sender and by month.
 */
export function searchMessages(
  messages: readonly ChatMessage[],
  queryWords: readonly string[],
): WordSearchResult {
  const searchedMessageCountsBySender = new Map<string, number>();
  const matchingMessageCountsBySender = new Map<string, number>();
  const matchingMessageCountsByMonthKey = new Map<number, number>();
  let searchedMessageCount = 0;
  let matchingMessageCount = 0;
  let occurrenceCount = 0;

  for (const message of messages) {
    const typedText = typedTextOf(message);
    if (typedText === null) {
      continue;
    }
    searchedMessageCount += 1;
    countOneMore(searchedMessageCountsBySender, message.sender);

    const occurrencesInMessage = countOccurrencesInText(typedText, queryWords);
    if (occurrencesInMessage > 0) {
      matchingMessageCount += 1;
      occurrenceCount += occurrencesInMessage;
      countOneMore(matchingMessageCountsBySender, message.sender);
      countOneMore(matchingMessageCountsByMonthKey, monthKeyFromDate(message.timestamp));
    }
  }

  return {
    searchedMessageCount,
    matchingMessageCount,
    occurrenceCount,
    searchedMessageCountsBySender,
    matchingMessageCountsBySender,
    matchingMessageCountsByMonthKey,
  };
}
