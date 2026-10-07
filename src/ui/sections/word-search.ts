/**
 * The "Look up a word" section: the reader types a word or a short phrase and
 * sees how many messages contain it, who says it most and how its use changed
 * over time. The word lists show what the report picked; this is where the
 * reader asks about a word of their own.
 *
 * The section is drawn with an empty field and a hint. When the reader types,
 * `page-controller.ts` searches the messages it already holds and draws the
 * outcome under the field with {@link renderWordSearchOutcome}; the file is
 * not read again, and what was typed is kept nowhere but in the field.
 *
 * The messages come from the analysis with the real texts, the people from
 * the analysis the report is drawn from. While names are hidden that is the
 * copy without names, so the outcome shows neutral labels, and it never shows
 * the text of a message either way.
 */

import {
  extractWords,
  monthKeyFromDate,
  parseSearchQuery,
  searchMessages,
  yearFromMonthKey,
} from '../../core/index';
import type {
  ChatAnalysis,
  ChatMessage,
  PersonStatistics,
  WordSearchResult,
} from '../../core/index';
import { renderBarStrip } from '../charts/bar-strip';
import type { BarStripBar } from '../charts/bar-strip';
import { renderHorizontalBars } from '../charts/horizontal-bars';
import type { HorizontalBarRow } from '../charts/horizontal-bars';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { colourOfPerson } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { findIndexOfLargest, sumOf } from '../ranking';
import {
  formatCountWithNoun,
  formatLongDate,
  formatPercentage,
  formatWholeNumber,
  monthAbbreviationOf,
} from '../text-formatting';
import { renderPeopleShownNote, selectFeaturedPeople } from './featured-people';
import type { PeopleShown } from './featured-people';
import { renderSectionHeading } from './section-heading';

/** The `id` of the field the reader types into; the page controller listens to it. */
export const WORD_SEARCH_INPUT_ID = 'word-search-input';

/** The `id` of the element that holds the outcome of the search; the page controller redraws it. */
export const WORD_SEARCH_RESULT_ID = 'word-search-result';

/**
 * How many characters the field takes. A word or a short phrase fits several
 * times; a pasted paragraph, which would find nothing anyway, does not.
 */
export const LONGEST_QUERY_LENGTH = 80;

/**
 * How many messages are searched at most: the newest ones. The search runs
 * on the main thread while the reader types; three hundred thousand messages
 * take a few tenths of a second, and a longer chat would make the field
 * stutter. The outcome says so when messages were left out.
 */
export const LARGEST_SEARCHED_MESSAGE_COUNT = 300_000;

/**
 * A person needs this many written messages before the word is also given per
 * 1,000 of them; one hit in three messages is not "333 per 1,000".
 */
export const MINIMUM_MESSAGES_FOR_WORD_RATE = 20;

/** The rate is given per this many messages, which keeps the usual rates above one. */
const MESSAGES_PER_RATE = 1000;

/** Rates below this are written with one decimal, so 0.4 and 0.6 can be told apart. */
const RATE_SHOWN_WITH_ONE_DECIMAL = 10;

/** Up to three years the use over time is drawn month by month: at most 36 bars. Beyond that, year by year. */
export const LONGEST_SPAN_SHOWN_BY_MONTH_IN_MONTHS = 36;

/** Up to a year of months, every bar has room for the name of its month under it. */
const MOST_MONTHS_LABELLED_ONE_BY_ONE = 12;

/** A strip that starts in November or December leaves no room for the year under its first bar. */
const LAST_MONTH_INDEX_WITH_ROOM_FOR_A_YEAR = 9;

/** A use over time needs two bars to show a change. */
const FEWEST_BARS_WORTH_DRAWING = 2;

/** "Who says it most" compares people, so it needs two. */
const FEWEST_PEOPLE_TO_COMPARE = 2;

const MONTHS_PER_YEAR = 12;

/** The colour of the bars of the use over time, which belong to nobody in particular. */
const USE_OVER_TIME_COLOUR = 'var(--neutral-bar)';

/** What {@link formatPercentage} writes for a share that rounds to nothing. */
const SHARE_ROUNDED_TO_NOTHING = '0.0%';

/** What is written instead, because a word that was found is not in 0.0% of the messages. */
const SMALLEST_SHARE_LABEL = 'under 0.1%';

/** Shown under the field until something is typed. */
export const WORD_SEARCH_HINT =
  'Type a word or a short phrase to see how often it was written, by whom and when. Capital letters and accents make no difference, and only whole words count: “sol” does not find “solo”.';

/** Shown when what was typed holds no letter. */
export const NOTHING_TO_LOOK_UP_NOTE =
  'Type at least one letter. Numbers, punctuation and emojis are not looked up.';

/** How often one person wrote the word or phrase. */
export interface PersonWordUse {
  /** The person's name as the report shows it: the real one, or a neutral label. */
  readonly name: string;
  /** Their messages that contain it. */
  readonly matchingMessageCount: number;
  /** Their messages that were searched: typed messages and captions. */
  readonly searchedMessageCount: number;
}

/** The length of time one bar of the use over time covers. */
export type WordUseGranularity = 'month' | 'year';

/**
 * Tells whether a chat holds any typed word, so there is something to look up.
 *
 * @param analysis - The analysed chat.
 * @returns `false` for a chat of media, deleted messages and emojis only.
 */
export function hasTextWorthSearching(analysis: ChatAnalysis): boolean {
  return analysis.people.some((person: PersonStatistics): boolean => person.wordCount > 0);
}

/**
 * Picks the messages that are searched: all of them, or the newest ones of a
 * very large chat.
 *
 * @param messages - The messages of the chat, oldest first.
 * @returns At most {@link LARGEST_SEARCHED_MESSAGE_COUNT} messages, oldest first.
 */
export function selectSearchedMessages(messages: readonly ChatMessage[]): readonly ChatMessage[] {
  if (messages.length <= LARGEST_SEARCHED_MESSAGE_COUNT) {
    return messages;
  }
  return messages.slice(-LARGEST_SEARCHED_MESSAGE_COUNT);
}

/**
 * Writes how many of every 1,000 messages contain the word.
 *
 * @param matchingMessageCount - The messages that contain it.
 * @param searchedMessageCount - The messages it was looked for in; not zero.
 * @returns For example `"8.3 per 1,000"` or `"125 per 1,000"`.
 */
export function formatRatePerThousand(
  matchingMessageCount: number,
  searchedMessageCount: number,
): string {
  const rate = (matchingMessageCount / searchedMessageCount) * MESSAGES_PER_RATE;
  const formattedRate =
    rate < RATE_SHOWN_WITH_ONE_DECIMAL ? rate.toFixed(1) : formatWholeNumber(rate);
  return `${formattedRate} per ${formatWholeNumber(MESSAGES_PER_RATE)}`;
}

/**
 * Writes the share of the searched messages that contain the word.
 *
 * @param matchingMessageCount - The messages that contain it; not zero.
 * @param searchedMessageCount - The messages it was looked for in; not zero.
 * @returns For example `"13%"` or `"4.8%"`, and `"under 0.1%"` for a share
 *   that would round to `"0.0%"`.
 */
export function formatShareOfMessages(
  matchingMessageCount: number,
  searchedMessageCount: number,
): string {
  const share = formatPercentage(matchingMessageCount / searchedMessageCount);
  return share === SHARE_ROUNDED_TO_NOTHING ? SMALLEST_SHARE_LABEL : share;
}

/**
 * Lists how often each person wrote the word, for the people who wrote it.
 *
 * The outcome of the search knows the senders by the names of the export.
 * The two lists of people hold the same people in the same order, so a
 * position leads from the real name to the name the report shows.
 *
 * @param result - What the search found.
 * @param people - The people of the analysis that was searched, with their real names.
 * @param shownPeople - The same people as the report shows them, cut to the
 *   ones it lists; while names are hidden these carry neutral labels.
 * @returns The listed people with at least one hit, the most hits first.
 */
export function listWordUseOfPeople(
  result: WordSearchResult,
  people: readonly PersonStatistics[],
  shownPeople: readonly PersonStatistics[],
): PersonWordUse[] {
  const wordUses: PersonWordUse[] = [];
  for (const [personIndex, shownPerson] of shownPeople.entries()) {
    const realName = people[personIndex]?.name ?? shownPerson.name;
    const matchingMessageCount = result.matchingMessageCountsBySender.get(realName) ?? 0;
    if (matchingMessageCount > 0) {
      wordUses.push({
        name: shownPerson.name,
        matchingMessageCount,
        searchedMessageCount: result.searchedMessageCountsBySender.get(realName) ?? 0,
      });
    }
  }
  wordUses.sort(
    (first: PersonWordUse, second: PersonWordUse): number =>
      second.matchingMessageCount - first.matchingMessageCount,
  );
  return wordUses;
}

/**
 * Counts the calendar months from one moment to another, both months included.
 */
function countMonthsBetween(first: Date, last: Date): number {
  const years = last.getFullYear() - first.getFullYear();
  return years * MONTHS_PER_YEAR + last.getMonth() - first.getMonth() + 1;
}

/**
 * Picks the bar length that keeps the use over time readable.
 *
 * @param first - When the oldest searched message was sent.
 * @param last - When the newest one was sent.
 * @returns `'month'` up to thirty-six calendar months, `'year'` beyond.
 */
export function chooseWordUseGranularity(first: Date, last: Date): WordUseGranularity {
  return countMonthsBetween(first, last) <= LONGEST_SPAN_SHOWN_BY_MONTH_IN_MONTHS
    ? 'month'
    : 'year';
}

/**
 * The text under the bar of a month. Up to twelve bars each one is named;
 * beyond that only every January carries its year, and so does the first bar
 * when there is room before the next January.
 */
function axisLabelOfMonth(monthStart: Date, barIndex: number, barCount: number): string {
  if (barCount <= MOST_MONTHS_LABELLED_ONE_BY_ONE) {
    return monthAbbreviationOf(monthStart);
  }
  const monthIndex = monthStart.getMonth();
  const isJanuary = monthIndex === 0;
  const isFirstBarWithRoom = barIndex === 0 && monthIndex <= LAST_MONTH_INDEX_WITH_ROOM_FOR_A_YEAR;
  return isJanuary || isFirstBarWithRoom ? String(monthStart.getFullYear()) : '';
}

/**
 * Builds one bar per calendar month from the first to the last, also for the
 * months without a hit.
 */
function buildMonthBars(result: WordSearchResult, first: Date, last: Date): BarStripBar[] {
  const barCount = countMonthsBetween(first, last);
  const bars: BarStripBar[] = [];
  for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
    const monthStart = new Date(first.getFullYear(), first.getMonth() + barIndex, 1);
    bars.push({
      axisLabel: axisLabelOfMonth(monthStart, barIndex, barCount),
      slotName: `${monthAbbreviationOf(monthStart)} ${String(monthStart.getFullYear())}`,
      messageCount: result.matchingMessageCountsByMonthKey.get(monthKeyFromDate(monthStart)) ?? 0,
    });
  }
  return bars;
}

/**
 * Builds one bar per calendar year from the first to the last, also for the
 * years without a hit.
 */
function buildYearBars(result: WordSearchResult, first: Date, last: Date): BarStripBar[] {
  const countsByYear = new Map<number, number>();
  for (const [monthKey, count] of result.matchingMessageCountsByMonthKey) {
    const year = yearFromMonthKey(monthKey);
    countsByYear.set(year, (countsByYear.get(year) ?? 0) + count);
  }

  const bars: BarStripBar[] = [];
  for (let year = first.getFullYear(); year <= last.getFullYear(); year += 1) {
    bars.push({
      axisLabel: String(year),
      slotName: String(year),
      messageCount: countsByYear.get(year) ?? 0,
    });
  }
  return bars;
}

/**
 * Splits the hits of a search into the bars of its use over time.
 *
 * @param result - What the search found.
 * @param first - When the oldest searched message was sent.
 * @param last - When the newest one was sent.
 * @returns One bar per month or per year between the two, oldest first,
 *   with no gaps.
 */
export function buildWordUseOverTime(
  result: WordSearchResult,
  first: Date,
  last: Date,
): BarStripBar[] {
  switch (chooseWordUseGranularity(first, last)) {
    case 'month':
      return buildMonthBars(result, first, last);
    case 'year':
      return buildYearBars(result, first, last);
  }
}

/**
 * Writes the words that were looked up, the way they were typed but without
 * what the search leaves out: capitals, digits and punctuation.
 */
function describeQuery(query: string): string {
  return extractWords(query).join(' ');
}

/**
 * Writes the sentence that sums the search up: in how many of the searched
 * messages the words stand, and how often when a message says them twice.
 */
function describeMatches(query: string, result: WordSearchResult): string {
  const share = formatShareOfMessages(result.matchingMessageCount, result.searchedMessageCount);
  const matching = formatWholeNumber(result.matchingMessageCount);
  const searched = formatCountWithNoun(
    result.searchedMessageCount,
    'written message',
    'written messages',
  );
  const sentence = `“${describeQuery(query)}” is in ${matching} of ${searched} (${share})`;
  if (result.occurrenceCount === result.matchingMessageCount) {
    return `${sentence}.`;
  }
  return `${sentence}, ${formatWholeNumber(result.occurrenceCount)} times in all.`;
}

/**
 * Writes the note that a very large chat was not searched from its start.
 * Empty when every message was searched.
 */
function renderCapNote(
  messages: readonly ChatMessage[],
  searchedMessages: readonly ChatMessage[],
): SafeHtml {
  const [firstSearchedMessage] = searchedMessages;
  if (firstSearchedMessage === undefined || searchedMessages.length === messages.length) {
    return EMPTY_HTML;
  }
  const note = `Only the latest ${formatWholeNumber(searchedMessages.length)} of ${formatWholeNumber(messages.length)} messages were searched, those from ${formatLongDate(firstSearchedMessage.timestamp)} on.`;
  return html`<p class="hint word-search-cap-note">${escapeHtml(note)}</p>`;
}

/**
 * Draws one bar per listed person who wrote the word, with their count and,
 * when they wrote enough for it, how many of every 1,000 of their messages
 * contain it.
 */
function renderWordUseBars(
  wordUses: readonly PersonWordUse[],
  personColours: PersonColours,
): SafeHtml {
  const rows = wordUses.map((wordUse: PersonWordUse): HorizontalBarRow => {
    const count = formatWholeNumber(wordUse.matchingMessageCount);
    const hasRate = wordUse.searchedMessageCount >= MINIMUM_MESSAGES_FOR_WORD_RATE;
    /* Two spaces: the stylesheet preserves them to set the rate apart from the count. */
    const displayValue = hasRate
      ? `${count}  ${formatRatePerThousand(wordUse.matchingMessageCount, wordUse.searchedMessageCount)}`
      : count;
    return {
      label: wordUse.name,
      value: wordUse.matchingMessageCount,
      colour: colourOfPerson(personColours, wordUse.name),
      displayValue,
    };
  });
  return renderHorizontalBars(rows);
}

/**
 * Draws "Who says it most": the bars of the listed people, and the notes on
 * what the numbers mean and on who is not listed. Empty for a chat with a
 * single sender.
 */
function renderWhoSaysIt(
  result: WordSearchResult,
  analysis: ChatAnalysis,
  drawnAnalysis: ChatAnalysis,
  personColours: PersonColours,
  peopleShown: PeopleShown,
): SafeHtml {
  if (drawnAnalysis.people.length < FEWEST_PEOPLE_TO_COMPARE) {
    return EMPTY_HTML;
  }

  const featuredPeople = selectFeaturedPeople(drawnAnalysis.people, peopleShown);
  const wordUses = listWordUseOfPeople(result, analysis.people, featuredPeople);
  const listedMatchCount = sumOf(
    wordUses.map((wordUse: PersonWordUse): number => wordUse.matchingMessageCount),
  );
  const unlistedMatchCount = result.matchingMessageCount - listedMatchCount;

  const explanation = `Messages that contain it, then how many of every ${formatWholeNumber(MESSAGES_PER_RATE)} messages that person wrote do, which compares a quiet person fairly. The rate is left out below ${String(MINIMUM_MESSAGES_FOR_WORD_RATE)} written messages.`;
  const barsHtml =
    wordUses.length === 0
      ? html`<p class="hint">None of the people listed wrote it.</p>`
      : html`${renderWordUseBars(wordUses, personColours)}<p class="hint">${escapeHtml(explanation)}</p>`;
  const unlistedNote = `${formatCountWithNoun(unlistedMatchCount, 'more message with it is', 'more messages with it are')} from people who are not listed.`;
  const unlistedHtml =
    unlistedMatchCount === 0
      ? EMPTY_HTML
      : html`<p class="hint word-search-unlisted-note">${escapeHtml(unlistedNote)}</p>`;
  const noteHtml = renderPeopleShownNote(featuredPeople.length, drawnAnalysis.people.length);

  return html`<div><h3>Who says it most</h3>${barsHtml}${unlistedHtml}${noteHtml}</div>`;
}

/**
 * Draws "Over time": the strip of bars with the sentence that names the
 * period the word was written most in. Empty when the searched messages lie
 * within one month, where there is no change to show.
 */
function renderUseOverTime(
  result: WordSearchResult,
  searchedMessages: readonly ChatMessage[],
): SafeHtml {
  const firstMessage = searchedMessages[0];
  const lastMessage = searchedMessages[searchedMessages.length - 1];
  if (firstMessage === undefined || lastMessage === undefined) {
    return EMPTY_HTML;
  }

  const bars = buildWordUseOverTime(result, firstMessage.timestamp, lastMessage.timestamp);
  const peakIndex = findIndexOfLargest(bars.map((bar: BarStripBar): number => bar.messageCount));
  const peakBar = peakIndex === null ? undefined : bars[peakIndex];
  if (bars.length < FEWEST_BARS_WORTH_DRAWING || peakBar === undefined) {
    return EMPTY_HTML;
  }

  const granularity = chooseWordUseGranularity(firstMessage.timestamp, lastMessage.timestamp);
  const peakCount = formatCountWithNoun(peakBar.messageCount, 'message', 'messages');
  const sentence = `Written most in ${peakBar.slotName}: ${peakCount}. One bar per ${granularity}; a busy ${granularity} has more of every word.`;
  const stripHtml = renderBarStrip(bars, USE_OVER_TIME_COLOUR, sentence);
  return html`<div><h3>Over time</h3>${stripHtml}<p class="hint">${escapeHtml(sentence)}</p></div>`;
}

/**
 * Searches the messages of a chat for what the reader typed and draws the
 * outcome: a hint for an empty field, a note when nothing was found, and
 * otherwise the count, who says it most and its use over time.
 *
 * @param query - The text of the field, as typed; untrusted like any text.
 * @param analysis - The analysis whose messages are searched, with the real
 *   texts and names: that of the period on display.
 * @param drawnAnalysis - The analysis the report is drawn from: the same one,
 *   or its copy without names, which lists the same people in the same order.
 * @param personColours - The colour assignment of the report on display.
 * @param peopleShown - Whether to list the most active people only, or everyone.
 * @returns The content of the outcome as markup, without the element around it.
 */
export function renderWordSearchOutcome(
  query: string,
  analysis: ChatAnalysis,
  drawnAnalysis: ChatAnalysis,
  personColours: PersonColours,
  peopleShown: PeopleShown,
): SafeHtml {
  if (query.trim() === '') {
    return html`<p class="hint">${escapeHtml(WORD_SEARCH_HINT)}</p>`;
  }
  const queryWords = parseSearchQuery(query.slice(0, LONGEST_QUERY_LENGTH));
  if (queryWords.length === 0) {
    return html`<p class="hint">${escapeHtml(NOTHING_TO_LOOK_UP_NOTE)}</p>`;
  }

  const searchedMessages = selectSearchedMessages(analysis.messages);
  const result = searchMessages(searchedMessages, queryWords);
  const capNoteHtml = renderCapNote(analysis.messages, searchedMessages);
  if (result.matchingMessageCount === 0) {
    const searched = formatCountWithNoun(
      result.searchedMessageCount,
      'written message',
      'written messages',
    );
    const nothingFound = `No message contains “${describeQuery(query)}”. ${searched} were searched.`;
    return html`<p class="word-search-summary">${escapeHtml(nothingFound)}</p>${capNoteHtml}`;
  }

  const summaryHtml = html`<p class="word-search-summary">${escapeHtml(describeMatches(query, result))}</p>`;
  const partsHtml = joinHtml([
    renderWhoSaysIt(result, analysis, drawnAnalysis, personColours, peopleShown),
    renderUseOverTime(result, searchedMessages),
  ]);
  const columnsHtml =
    partsHtml === EMPTY_HTML ? EMPTY_HTML : html`<div class="two-columns">${partsHtml}</div>`;
  return html`${summaryHtml}${capNoteHtml}${columnsHtml}`;
}

/**
 * Draws the "Look up a word" section with an empty field.
 *
 * @param analysis - The analysed chat.
 * @returns A `<section>` element as markup, or empty markup for a chat in
 *   which nobody typed a word.
 */
export function renderWordSearchSection(analysis: ChatAnalysis): SafeHtml {
  if (!hasTextWorthSearching(analysis)) {
    return EMPTY_HTML;
  }

  const headingHtml = renderSectionHeading(
    'Look up a word',
    'A word or phrase of your choice: how many messages contain it, who says it most and when. What you type stays in this tab, like the chat.',
  );
  const inputId = escapeHtml(WORD_SEARCH_INPUT_ID);
  const fieldHtml = html`<div class="word-search-field"><label for="${inputId}">Word or phrase</label><input type="search" id="${inputId}" maxlength="${LONGEST_QUERY_LENGTH}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>`;
  const hintHtml = html`<p class="hint">${escapeHtml(WORD_SEARCH_HINT)}</p>`;

  return html`<section>${headingHtml}${fieldHtml}<div class="word-search-result" id="${escapeHtml(WORD_SEARCH_RESULT_ID)}" aria-live="polite">${hintHtml}</div></section>`;
}
