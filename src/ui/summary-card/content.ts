/**
 * What the summary image says: the headline numbers of a chat, as plain text
 * and plain numbers.
 *
 * Nothing here knows about pixels or a canvas. The words are worked out here,
 * `layout.ts` decides where they go, and `canvas.ts` draws them.
 */

import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { collectAwards } from '../awards';
import type { Award } from '../awards';
import type { PeopleShown } from '../sections/featured-people';
import {
  formatCountWithNoun,
  formatLongDate,
  formatPercentage,
  formatWholeNumber,
} from '../text-formatting';

/**
 * How many people the image shows as bars. Five rows are what fits between the
 * total and the facts at a size that can still be read on a phone.
 */
export const SUMMARY_CARD_PEOPLE_LIMIT = 5;

/**
 * How many awards the image quotes. Each takes two lines, and three of them
 * fill what is left of the image.
 */
export const SUMMARY_CARD_AWARD_LIMIT = 3;

/**
 * A streak of a single day is not worth a place on the image, as in "What
 * stands out".
 */
const SHORTEST_STREAK_WORTH_SHOWING_IN_DAYS = 2;

/** One of the most active people, as a row of the image. */
export interface SummaryCardPerson {
  /** The person's name, or their neutral label while names are hidden. */
  readonly name: string;
  /** How many messages they sent. */
  readonly messageCount: number;
  /** Their count and share of all messages in words, e.g. `"1,234 · 53%"`. */
  readonly countAndShare: string;
}

/** One fact of the chat, as a tile of the image. */
export interface SummaryCardFact {
  /** What the fact is, e.g. `"Busiest day"`. */
  readonly label: string;
  /** The fact itself, e.g. `"13 Jan 2024"`. */
  readonly value: string;
  /** What qualifies it, e.g. `"124 messages"`. */
  readonly detail: string;
}

/** One award, as two lines of the image. */
export interface SummaryCardAward {
  /** The title of the award, e.g. `"The night owl"`. */
  readonly title: string;
  /** Who took it. */
  readonly winnerName: string;
  /** The number that earned it, in words. */
  readonly reason: string;
}

/** Everything the summary image says. All text is plain and untrusted. */
export interface SummaryCardContent {
  /** The name of the chat, or the neutral title while names are hidden. */
  readonly title: string;
  /** The first and last day and the span, e.g. `"5 Jan 2026 to 30 Sep 2026 · 269 days"`. */
  readonly period: string;
  /** The number of messages with its thousands separators, e.g. `"12,345"`. */
  readonly messageCount: string;
  /** The noun after the number: `"message"` or `"messages"`. */
  readonly messageNoun: string;
  /** The most active people, most messages first; five at most. */
  readonly people: readonly SummaryCardPerson[];
  /** How many people wrote in the chat and are not among {@link SummaryCardContent.people}. */
  readonly otherPeopleCount: number;
  /** The busiest day and, when it is longer than a day, the longest streak. */
  readonly facts: readonly SummaryCardFact[];
  /** The first three awards that were given; empty for a chat with a single sender. */
  readonly awards: readonly SummaryCardAward[];
}

/**
 * Writes the line under the title, as the heading of the report does.
 */
function describeChatPeriod(analysis: ChatAnalysis): string {
  const firstDay = formatLongDate(analysis.firstMessageTimestamp);
  const lastDay = formatLongDate(analysis.lastMessageTimestamp);
  const span = formatCountWithNoun(analysis.spanInDays, 'day', 'days');
  return `${firstDay} to ${lastDay} · ${span}`;
}

/**
 * Turns one of the most active people into a row of the image.
 */
function describePerson(person: PersonStatistics, analysis: ChatAnalysis): SummaryCardPerson {
  const share = formatPercentage(person.messageCount / analysis.totalMessageCount);
  return {
    name: person.name,
    messageCount: person.messageCount,
    countAndShare: `${formatWholeNumber(person.messageCount)} · ${share}`,
  };
}

/**
 * The day with the most messages, as a tile.
 */
function describeBusiestDay(analysis: ChatAnalysis): SummaryCardFact {
  const { date, messageCount } = analysis.busiestDay;
  return {
    label: 'Busiest day',
    value: formatLongDate(date),
    detail: formatCountWithNoun(messageCount, 'message', 'messages'),
  };
}

/**
 * The longest run of days with messages, as a tile.
 *
 * @returns The tile, or `null` when no two active days follow each other.
 */
function describeLongestStreak(analysis: ChatAnalysis): SummaryCardFact | null {
  const streak = analysis.longestStreak;
  if (streak.lengthInDays < SHORTEST_STREAK_WORTH_SHOWING_IN_DAYS) {
    return null;
  }
  return {
    label: 'Longest streak',
    value: `${formatWholeNumber(streak.lengthInDays)} days in a row`,
    detail: `${formatLongDate(streak.from)} to ${formatLongDate(streak.to)}`,
  };
}

/**
 * Picks the awards the image quotes: the first three of the "Awards" section,
 * which is left out of a chat with a single sender.
 */
function selectAwards(analysis: ChatAnalysis, peopleShown: PeopleShown): SummaryCardAward[] {
  const hasSeveralPeople = analysis.people.length > 1;
  if (!hasSeveralPeople) {
    return [];
  }
  return collectAwards(analysis, peopleShown)
    .slice(0, SUMMARY_CARD_AWARD_LIMIT)
    .map((award: Award): SummaryCardAward => ({
      title: award.title,
      winnerName: award.winner.name,
      reason: award.reason,
    }));
}

/**
 * Gathers what the summary image says about a chat.
 *
 * The image shows what the report shows: hand it the analysis the report was
 * drawn from, so the copy without names while "Hide names" is ticked, and the
 * analysis of the period on display.
 *
 * @param analysis - The analysed chat, as the report on display was drawn from it.
 * @param title - The title above that report; untrusted.
 * @param peopleShown - Whether the most active people compete for the awards, or everyone.
 * @returns The texts and numbers of the image.
 */
export function collectSummaryCardContent(
  analysis: ChatAnalysis,
  title: string,
  peopleShown: PeopleShown,
): SummaryCardContent {
  const shownPeople = analysis.people.slice(0, SUMMARY_CARD_PEOPLE_LIMIT);
  const candidateFacts: (SummaryCardFact | null)[] = [
    describeBusiestDay(analysis),
    describeLongestStreak(analysis),
  ];
  return {
    title,
    period: describeChatPeriod(analysis),
    messageCount: formatWholeNumber(analysis.totalMessageCount),
    messageNoun: analysis.totalMessageCount === 1 ? 'message' : 'messages',
    people: shownPeople.map((person: PersonStatistics): SummaryCardPerson =>
      describePerson(person, analysis),
    ),
    otherPeopleCount: analysis.people.length - shownPeople.length,
    facts: candidateFacts.filter(
      (fact: SummaryCardFact | null): fact is SummaryCardFact => fact !== null,
    ),
    awards: selectAwards(analysis, peopleShown),
  };
}
