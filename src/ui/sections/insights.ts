/**
 * The "What stands out" section: a list of sentences that put the most
 * notable facts of the chat into words.
 *
 * Each sentence has its own function, which returns `null` when the chat does
 * not have enough data for the sentence to be meaningful. The thresholds exist
 * so that nobody is called "the night owl" on the strength of two messages.
 */

import { formatDuration, MILLISECONDS_PER_DAY } from '../../core/index';
import type { ChatAnalysis, PersonStatistics, WeekdayHourHeatmap } from '../../core/index';
import { findBusiestSlot } from '../charts/heatmap';
import { escapeHtml, html, joinHtml, renderBoldName } from '../html';
import type { SafeHtml } from '../html';
import { ratioWhenAtLeast, sumOf } from '../ranking';
import {
  formatLongDate,
  formatPercentage,
  formatWholeNumber,
  padToTwoDigits,
  weekdayNameOf,
} from '../text-formatting';
import {
  DEFAULT_PEOPLE_SHOWN,
  formatReplyDelay,
  rankPeopleBy,
  selectFeaturedPeople,
  typicalReplyDelayOf,
} from './featured-people';
import type { PeopleShown } from './featured-people';
import { renderSectionHeading } from './section-heading';
import { countSilentDaysAtEnd, formatSilence, hasGoneQuiet } from './who-is-still-here';

/** The "for every 10 from X, Y sends N" comparison is expressed per this many messages. */
const MESSAGES_IN_RATIO_COMPARISON = 10;

/** A person needs this many typed messages before their laughing or word averages are compared. */
export const MINIMUM_TEXT_MESSAGES_FOR_WRITING_HABITS = 10;

/** A person needs this many messages before their share of night messages is compared. */
export const MINIMUM_MESSAGES_FOR_NIGHT_OWL = 20;

/** The night owl is only named when at least 3% of their messages are sent at night. */
export const MINIMUM_NIGHT_SHARE_FOR_NIGHT_OWL = 0.03;

/** A person needs this many turns before their messages-per-turn average is compared. */
const MINIMUM_TURNS_FOR_MESSAGES_IN_A_ROW = 5;

/** A streak of a single day is not worth mentioning. */
const SHORTEST_STREAK_WORTH_MENTIONING_IN_DAYS = 2;

/**
 * A person needs this many messages before their silence is put into a
 * sentence. Somebody who said hello twice three years ago did not go quiet;
 * they were never part of the chat.
 */
const MINIMUM_MESSAGES_FOR_GONE_QUIET = 20;

/**
 * For a chat of two, how many messages the more active person sends for every
 * ten from the other.
 */
function describeImbalanceBetweenTwo(
  mostActivePerson: PersonStatistics,
  otherPerson: PersonStatistics,
): SafeHtml {
  const messagesPerComparison =
    (mostActivePerson.messageCount / otherPerson.messageCount) * MESSAGES_IN_RATIO_COMPARISON;
  const roundedMessagesPerComparison = escapeHtml(messagesPerComparison.toFixed(0));
  const otherName = escapeHtml(otherPerson.name);
  const mostActiveName = escapeHtml(mostActivePerson.name);
  return html` For every ${MESSAGES_IN_RATIO_COMPARISON} from ${otherName}, ${mostActiveName} sends ${roundedMessagesPerComparison}.`;
}

/**
 * Who writes the most, and for a chat of two, how lopsided it is.
 */
function describeMostActivePerson(analysis: ChatAnalysis): SafeHtml | null {
  const [mostActivePerson, secondPerson] = analysis.people;
  if (mostActivePerson === undefined || secondPerson === undefined) {
    return null;
  }

  const share = escapeHtml(
    formatPercentage(mostActivePerson.messageCount / analysis.totalMessageCount),
  );
  const sentence = html`${renderBoldName(mostActivePerson.name)} writes the most: ${share} of all messages.`;

  const isChatOfTwo = analysis.people.length === 2;
  if (isChatOfTwo && secondPerson.messageCount > 0) {
    return html`${sentence}${describeImbalanceBetweenTwo(mostActivePerson, secondPerson)}`;
  }
  return sentence;
}

/**
 * The weekday and hour in which the chat is busiest.
 */
function describeBusiestSlot(analysis: ChatAnalysis): SafeHtml | null {
  const busiestSlot = findBusiestSlot(analysis.weekdayHourHeatmap);
  if (busiestSlot === null) {
    return null;
  }
  const weekdayName = escapeHtml(weekdayNameOf(busiestSlot.weekdayIndex));
  const hourLabel = escapeHtml(`${padToTwoDigits(busiestSlot.hour)}:00`);
  const formattedCount = escapeHtml(formatWholeNumber(busiestSlot.messageCount));
  return html`The chat is most alive on <b>${weekdayName}s around ${hourLabel}</b>, with ${formattedCount} messages in that hour slot.`;
}

/**
 * Finds the weekday with the fewest messages; the earliest one wins a tie.
 *
 * @param heatmap - Message counts by weekday (Monday first) and hour.
 * @returns 0 for Monday up to 6 for Sunday.
 */
export function findQuietestWeekdayIndex(heatmap: WeekdayHourHeatmap): number {
  const totalsByWeekday = heatmap.map((hourCounts: readonly number[]): number => sumOf(hourCounts));
  const smallestTotal = Math.min(...totalsByWeekday);
  return totalsByWeekday.indexOf(smallestTotal);
}

/**
 * The weekday on which the chat is quietest.
 */
function describeQuietestWeekday(analysis: ChatAnalysis): SafeHtml {
  const quietestWeekdayIndex = findQuietestWeekdayIndex(analysis.weekdayHourHeatmap);
  const weekdayName = escapeHtml(weekdayNameOf(quietestWeekdayIndex));
  return html`The quietest day of the week is <b>${weekdayName}</b>.`;
}

/**
 * Who replies fastest and who slowest, when at least two people can be compared.
 */
function describeReplySpeed(analysis: ChatAnalysis, peopleShown: PeopleShown): SafeHtml | null {
  const featuredPeople = selectFeaturedPeople(analysis.people, peopleShown);
  const peopleByReplyDelay = rankPeopleBy(featuredPeople, typicalReplyDelayOf, 'ascending');
  const fastest = peopleByReplyDelay[0];
  const slowest = peopleByReplyDelay[peopleByReplyDelay.length - 1];
  if (fastest === undefined || slowest === undefined || peopleByReplyDelay.length < 2) {
    return null;
  }

  const fastestDelay = escapeHtml(formatReplyDelay(fastest.value, analysis.timestampResolution));
  const slowestDelay = escapeHtml(formatReplyDelay(slowest.value, analysis.timestampResolution));
  const fastestName = renderBoldName(fastest.person.name);
  const slowestName = renderBoldName(slowest.person.name);
  return html`${fastestName} replies fastest, typically in <b>${fastestDelay}</b>. ${slowestName} takes ${slowestDelay}.`;
}

/**
 * Who opens the most conversations.
 */
function describeConversationStarter(analysis: ChatAnalysis): SafeHtml | null {
  const peopleByStarts = rankPeopleBy(
    analysis.people,
    (person: PersonStatistics): number => person.conversationsStartedCount,
    'descending',
  );
  const starter = peopleByStarts[0];
  if (starter === undefined) {
    return null;
  }

  const share = escapeHtml(formatPercentage(starter.value / analysis.conversationCount));
  const formattedStarts = escapeHtml(formatWholeNumber(starter.value));
  const formattedConversations = escapeHtml(formatWholeNumber(analysis.conversationCount));
  return html`${renderBoldName(starter.person.name)} starts <b>${share}</b> of the conversations (${formattedStarts} of ${formattedConversations}).`;
}

/**
 * The longest run of consecutive days with at least one message.
 */
function describeLongestStreak(analysis: ChatAnalysis): SafeHtml | null {
  const streak = analysis.longestStreak;
  if (streak.lengthInDays < SHORTEST_STREAK_WORTH_MENTIONING_IN_DAYS) {
    return null;
  }
  const firstDay = escapeHtml(formatLongDate(streak.from));
  const lastDay = escapeHtml(formatLongDate(streak.to));
  return html`Longest streak: <b>${streak.lengthInDays} days in a row</b>, from ${firstDay} to ${lastDay}.`;
}

/**
 * The longest pause between two messages, when it lasted more than a day.
 */
function describeLongestSilence(analysis: ChatAnalysis): SafeHtml | null {
  const silence = analysis.longestSilence;
  if (silence === null || silence.durationInMilliseconds <= MILLISECONDS_PER_DAY) {
    return null;
  }
  const duration = escapeHtml(formatDuration(silence.durationInMilliseconds));
  const lastMessageBefore = escapeHtml(formatLongDate(silence.from));
  const firstMessageAfter = escapeHtml(formatLongDate(silence.to));
  return html`Longest silence: <b>${duration}</b>, between ${lastMessageBefore} and ${firstMessageAfter}.`;
}

/**
 * The most active person who has gone quiet, and since when.
 */
function describePersonGoneQuiet(
  analysis: ChatAnalysis,
  peopleShown: PeopleShown,
): SafeHtml | null {
  /* The people are ranked by messages, so the first match is the one whose absence shows most. */
  const quietPerson = selectFeaturedPeople(analysis.people, peopleShown).find(
    (person: PersonStatistics): boolean =>
      person.messageCount >= MINIMUM_MESSAGES_FOR_GONE_QUIET && hasGoneQuiet(person, analysis),
  );
  if (quietPerson === undefined) {
    return null;
  }
  const lastDay = escapeHtml(formatLongDate(quietPerson.lastMessageTimestamp));
  const silence = escapeHtml(formatSilence(countSilentDaysAtEnd(quietPerson, analysis)));
  return html`${renderBoldName(quietPerson.name)} has not written since <b>${lastDay}</b>, the last ${silence} of the chat.`;
}

/**
 * The day with the most messages.
 */
function describeBusiestDay(analysis: ChatAnalysis): SafeHtml {
  const busiestDay = analysis.busiestDay;
  const day = escapeHtml(formatLongDate(busiestDay.date));
  const formattedCount = escapeHtml(formatWholeNumber(busiestDay.messageCount));
  return html`Busiest day: <b>${day}</b> with ${formattedCount} messages.`;
}

/**
 * Who laughs in writing most often, as a share of their typed messages.
 */
function describeMostFrequentLaugher(
  analysis: ChatAnalysis,
  peopleShown: PeopleShown,
): SafeHtml | null {
  const peopleByLaughShare = rankPeopleBy(
    selectFeaturedPeople(analysis.people, peopleShown),
    (person: PersonStatistics): number | null =>
      ratioWhenAtLeast(
        person.laughingMessageCount,
        person.textMessageCount,
        MINIMUM_TEXT_MESSAGES_FOR_WRITING_HABITS,
      ),
    'descending',
  );
  const laugher = peopleByLaughShare[0];
  if (laugher === undefined || laugher.person.laughingMessageCount === 0) {
    return null;
  }
  const share = escapeHtml(formatPercentage(laugher.value));
  return html`${renderBoldName(laugher.person.name)} laughs the most in writing: ${share} of their messages contain a laugh such as jaja or haha.`;
}

/**
 * Who writes the longest messages on average, against who writes the shortest.
 */
function describeLongestWriter(analysis: ChatAnalysis, peopleShown: PeopleShown): SafeHtml | null {
  const peopleByWordsPerMessage = rankPeopleBy(
    selectFeaturedPeople(analysis.people, peopleShown),
    (person: PersonStatistics): number | null =>
      ratioWhenAtLeast(
        person.wordCount,
        person.textMessageCount,
        MINIMUM_TEXT_MESSAGES_FOR_WRITING_HABITS,
      ),
    'descending',
  );
  const wordiest = peopleByWordsPerMessage[0];
  const tersest = peopleByWordsPerMessage[peopleByWordsPerMessage.length - 1];
  if (wordiest === undefined || tersest === undefined || peopleByWordsPerMessage.length < 2) {
    return null;
  }
  const wordiestAverage = escapeHtml(wordiest.value.toFixed(1));
  const tersestAverage = escapeHtml(tersest.value.toFixed(1));
  const tersestName = escapeHtml(tersest.person.name);
  return html`${renderBoldName(wordiest.person.name)} writes the longest messages, ${wordiestAverage} words on average against ${tersestAverage} for ${tersestName}.`;
}

/**
 * Who sends the largest share of their messages between midnight and 5:00.
 */
function describeNightOwl(analysis: ChatAnalysis, peopleShown: PeopleShown): SafeHtml | null {
  const peopleByNightShare = rankPeopleBy(
    selectFeaturedPeople(analysis.people, peopleShown),
    (person: PersonStatistics): number | null =>
      ratioWhenAtLeast(
        person.nightMessageCount,
        person.messageCount,
        MINIMUM_MESSAGES_FOR_NIGHT_OWL,
      ),
    'descending',
  );
  const nightOwl = peopleByNightShare[0];
  if (nightOwl === undefined || nightOwl.value < MINIMUM_NIGHT_SHARE_FOR_NIGHT_OWL) {
    return null;
  }
  const share = escapeHtml(formatPercentage(nightOwl.value));
  return html`${renderBoldName(nightOwl.person.name)} is the night owl: ${share} of their messages are sent between midnight and 5:00.`;
}

/**
 * Who sends the most messages in a row before somebody else writes.
 */
function describeMostMessagesInARow(
  analysis: ChatAnalysis,
  peopleShown: PeopleShown,
): SafeHtml | null {
  const peopleByMessagesPerTurn = rankPeopleBy(
    selectFeaturedPeople(analysis.people, peopleShown),
    (person: PersonStatistics): number | null =>
      ratioWhenAtLeast(person.messageCount, person.turnCount, MINIMUM_TURNS_FOR_MESSAGES_IN_A_ROW),
    'descending',
  );
  const mostInARow = peopleByMessagesPerTurn[0];
  if (mostInARow === undefined) {
    return null;
  }
  const messagesPerTurn = escapeHtml(mostInARow.value.toFixed(1));
  return html`${renderBoldName(mostInARow.person.name)} sends the most messages in a row before anyone answers: ${messagesPerTurn} per turn.`;
}

/**
 * Writes the sentences that apply to a chat, in the order they are shown.
 *
 * Sentences that compare people are left out of a chat with a single sender.
 *
 * @param analysis - The analysed chat.
 * @param peopleShown - Whether the sentences compare the most active people only, or everyone.
 * @returns Each sentence as markup; names are already escaped.
 */
export function collectInsights(
  analysis: ChatAnalysis,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
): SafeHtml[] {
  const hasSeveralPeople = analysis.people.length > 1;
  const candidateSentences: (SafeHtml | null)[] = [
    hasSeveralPeople ? describeMostActivePerson(analysis) : null,
    describeBusiestSlot(analysis),
    describeQuietestWeekday(analysis),
    hasSeveralPeople ? describeReplySpeed(analysis, peopleShown) : null,
    hasSeveralPeople ? describeConversationStarter(analysis) : null,
    describeLongestStreak(analysis),
    describeLongestSilence(analysis),
    describePersonGoneQuiet(analysis, peopleShown),
    describeBusiestDay(analysis),
    describeMostFrequentLaugher(analysis, peopleShown),
    describeLongestWriter(analysis, peopleShown),
    describeNightOwl(analysis, peopleShown),
    hasSeveralPeople ? describeMostMessagesInARow(analysis, peopleShown) : null,
  ];
  return candidateSentences.filter(
    (sentence: SafeHtml | null): sentence is SafeHtml => sentence !== null,
  );
}

/**
 * Draws the "What stands out" section.
 *
 * @param analysis - The analysed chat.
 * @param peopleShown - Whether the sentences compare the most active people only, or everyone.
 * @returns A `<section>` element as markup.
 */
export function renderInsightsSection(
  analysis: ChatAnalysis,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
): SafeHtml {
  const itemsHtml = joinHtml(
    collectInsights(analysis, peopleShown).map(
      (sentence: SafeHtml): SafeHtml => html`<li>${sentence}</li>`,
    ),
  );
  const headingHtml = renderSectionHeading('What stands out');
  return html`<section>${headingHtml}<ul class="insights">${itemsHtml}</ul></section>`;
}
