/**
 * What the recap of one year says: a short list of cards, each with a
 * headline and one to three supporting lines.
 *
 * Everything here is a pure function from the analysis of the year (and a
 * few totals of the whole chat) to plain text. No card holds markup, a
 * message text or anything that has to be measured on a page, so the list
 * can be tested as data; `render.ts` escapes it on the way to the page. A
 * card with nothing meaningful to say is left out.
 *
 * Names come from the analysis handed in. While "Hide names" is ticked the
 * page hands in the copy without names, so the cards carry its labels.
 */

import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { dateFromDayKey } from '../../core/index';
import { collectAwards } from '../awards';
import type { Award } from '../awards';
import { findBusiestSlot } from '../charts/heatmap';
import { findIndexOfLargest, sumOf } from '../ranking';
import type { PeopleShown } from '../sections/featured-people';
import { SHORTEST_STREAK_WORTH_MENTIONING_IN_DAYS } from '../sections/insights';
import {
  formatCountWithNoun,
  formatLongDate,
  formatPercentage,
  formatWholeNumber,
  padToTwoDigits,
  weekdayNameOf,
} from '../text-formatting';
import type { YearSummary } from './years';

/** What a card is about; the page uses it to tell the cards apart. */
export type RecapCardKind =
  'messages' | 'busiest' | 'people' | 'rhythm' | 'word' | 'emoji' | 'streak' | 'awards' | 'closing';

/** One screen of the recap, as plain text that still has to be escaped. */
export interface RecapCard {
  /** What the card is about. */
  readonly kind: RecapCardKind;
  /** The few words above the headline that say what kind of fact follows, e.g. `"Word of the year"`. */
  readonly label: string;
  /** The one big statement of the card. */
  readonly headline: string;
  /** One to three sentences under the headline. */
  readonly lines: readonly string[];
}

/** What the cards need to know besides the analysis of the year itself. */
export interface RecapContext {
  /** The year the recap is about, as the whole chat counts it. */
  readonly yearSummary: YearSummary;
  /** The calendar year just before it, or `null` when the chat has no message in it. */
  readonly previousYearSummary: YearSummary | null;
  /**
   * The analysis of the whole chat, for the words and emojis of the other
   * years; its copy without names while "Hide names" is ticked.
   */
  readonly wholeChatAnalysis: ChatAnalysis;
  /** Whether the most active people compete for the titles, or everyone. */
  readonly peopleShown: PeopleShown;
}

/** How a word or an emoji came to stand on its card. */
export type TermOfYearKind = 'distinctive' | 'most-used';

/** The word or the emoji of a year. */
export interface TermOfYear {
  /** The word or the emoji. */
  readonly term: string;
  /** How often it was used in the year. */
  readonly count: number;
  /**
   * `distinctive` when it was picked for being used far more in this year
   * than in the rest of the chat; `most-used` when it is simply the one used
   * most, because there was too little to compare with or nothing stood out.
   */
  readonly kind: TermOfYearKind;
  /**
   * For a distinctive term, how many times as often it was used in the year
   * as the rest of the chat would lead one to expect; `null` when the rest of
   * the chat never uses it, and for a most used term.
   */
  readonly timesAsOften: number | null;
}

/**
 * A change of the daily pace smaller than this, against the year before, is
 * called "about the same": a twentieth more or fewer messages a day is within
 * what a holiday or a busy week moves.
 */
export const SMALLEST_PACE_CHANGE_WORTH_NAMING = 0.05;

/** From this ratio on, a faster pace is told as "N times as many" instead of a percentage. */
const PACE_RATIO_TOLD_AS_TIMES = 2;

/** A daily pace below this is written with one decimal ("3.4 a day"). */
const PACE_SHOWN_WITH_ONE_DECIMAL = 10;

/**
 * A word or an emoji needs this many uses in the year before it can stand on
 * a card; one used three times is nobody's word of the year.
 */
export const MINIMUM_USES_FOR_TERM_OF_YEAR = 5;

/**
 * A term counts as distinctive from this many times the uses the rest of the
 * chat would lead one to expect. One and a half is the point from which the
 * difference shows in a chart of the word's use.
 */
export const MINIMUM_DISTINCTIVE_RATIO = 1.5;

/**
 * The other years need this many counted words before the words of a year
 * are compared with them; against less, every word of the year looks special.
 */
export const MINIMUM_OTHER_WORDS_FOR_COMPARISON = 500;

/** The same for emojis, of which a chat holds far fewer than words. */
export const MINIMUM_OTHER_EMOJIS_FOR_COMPARISON = 100;

/** From this many times on, "times as often" is written as a whole number ("12 times"). */
const TIMES_AS_OFTEN_SHOWN_WHOLE = 10;

/** How many people the card of who wrote most names. */
const PEOPLE_ON_RANKING_CARD = 3;

/** How many titles the card of the awards names. */
const AWARDS_ON_CARD = 3;

/** The names of the months, January first, indexed by `Date.getMonth()`. */
const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A year the chat runs through from 1 January to 31 December covers at least this many days. */
const DAYS_IN_SHORTEST_YEAR = 365;

/**
 * Writes how many messages a day a year had.
 *
 * @param messagesPerDay - The average over the days of the year the export covers.
 * @returns For example `"3.4"` or `"27"`.
 */
export function formatDailyPace(messagesPerDay: number): string {
  if (messagesPerDay < PACE_SHOWN_WITH_ONE_DECIMAL) {
    return messagesPerDay.toFixed(1);
  }
  return formatWholeNumber(messagesPerDay);
}

/**
 * Compares the pace of a year with that of the year before. The two are
 * compared by messages per day the export covers, not by their totals, so a
 * year the chat started or ended in is not taken for a quiet one.
 *
 * @param yearSummary - The year of the recap.
 * @param previousYearSummary - The year before it.
 * @returns One sentence.
 */
export function describePaceAgainstPreviousYear(
  yearSummary: YearSummary,
  previousYearSummary: YearSummary,
): string {
  const pace = yearSummary.messageCount / yearSummary.coveredDayCount;
  const previousPace = previousYearSummary.messageCount / previousYearSummary.coveredDayCount;
  const ratio = pace / previousPace;
  const paces = `${formatDailyPace(previousPace)} a day then, ${formatDailyPace(pace)} now`;
  const previousYear = String(previousYearSummary.year);

  if (Math.abs(ratio - 1) < SMALLEST_PACE_CHANGE_WORTH_NAMING) {
    return `About the same pace as in ${previousYear}: ${paces}.`;
  }
  if (ratio >= PACE_RATIO_TOLD_AS_TIMES) {
    return `${ratio.toFixed(1)} times as many a day as in ${previousYear}: ${paces}.`;
  }
  if (ratio > 1) {
    return `${formatPercentage(ratio - 1)} more a day than in ${previousYear}: ${paces}.`;
  }
  return `${formatPercentage(1 - ratio)} fewer a day than in ${previousYear}: ${paces}.`;
}

/**
 * The opening card: how many messages the year had, on how many of its days
 * somebody wrote, and how that compares with the year before.
 */
function buildMessagesCard(analysis: ChatAnalysis, context: RecapContext): RecapCard {
  const { yearSummary, previousYearSummary } = context;
  const year = String(yearSummary.year);
  const activeDays = formatWholeNumber(analysis.activeDayCount);
  const coveredDays = formatWholeNumber(yearSummary.coveredDayCount);
  const isWholeYear = yearSummary.coveredDayCount >= DAYS_IN_SHORTEST_YEAR;

  const lines = [
    isWholeYear
      ? `Somebody wrote on ${activeDays} of its ${coveredDays} days.`
      : `Somebody wrote on ${activeDays} of the ${coveredDays} days of ${year} that this export covers.`,
  ];
  if (previousYearSummary !== null) {
    lines.push(describePaceAgainstPreviousYear(yearSummary, previousYearSummary));
  }
  return {
    kind: 'messages',
    label: 'The year in numbers',
    headline: `${formatCountWithNoun(analysis.totalMessageCount, 'message', 'messages')} in ${year}`,
    lines,
  };
}

/**
 * Adds up the messages of each month of a year.
 *
 * @param messageCountsByDayKey - Messages per day of one calendar year.
 * @returns Twelve counts, January first.
 */
export function countMessagesByMonth(messageCountsByDayKey: ReadonlyMap<number, number>): number[] {
  const countsByMonth = new Array<number>(MONTH_NAMES.length).fill(0);
  for (const [dayKey, messageCount] of messageCountsByDayKey) {
    const monthIndex = dateFromDayKey(dayKey).getMonth();
    countsByMonth[monthIndex] = (countsByMonth[monthIndex] ?? 0) + messageCount;
  }
  return countsByMonth;
}

/**
 * The card of the peaks: the busiest month and the busiest day. A year whose
 * messages all fall in one month has no busiest month worth the name, so its
 * card leads with the day.
 */
function buildBusiestCard(analysis: ChatAnalysis): RecapCard {
  const { busiestDay } = analysis;
  const day = formatLongDate(busiestDay.date);
  const dayCount = formatCountWithNoun(busiestDay.messageCount, 'message', 'messages');

  const countsByMonth = countMessagesByMonth(analysis.messageCountsByDayKey);
  const monthsWithMessages = countsByMonth.filter((count: number): boolean => count > 0).length;
  const busiestMonthIndex = findIndexOfLargest(countsByMonth);
  if (monthsWithMessages < 2 || busiestMonthIndex === null) {
    return {
      kind: 'busiest',
      label: 'When it peaked',
      headline: `${day} was the busiest day`,
      lines: [`${dayCount} on that one day.`],
    };
  }

  const monthCount = countsByMonth[busiestMonthIndex] ?? 0;
  const share = formatPercentage(monthCount / analysis.totalMessageCount);
  return {
    kind: 'busiest',
    label: 'When it peaked',
    headline: `${MONTH_NAMES[busiestMonthIndex] ?? ''} was the busiest month`,
    lines: [
      `${formatCountWithNoun(monthCount, 'message', 'messages')}, ${share} of the year.`,
      `The busiest single day was ${day}, with ${dayCount}.`,
    ],
  };
}

/**
 * The card of who wrote most: the first three people with their shares. Left
 * out of a year in which one person wrote alone.
 */
function buildPeopleCard(analysis: ChatAnalysis): RecapCard | null {
  const [mostActivePerson, secondPerson] = analysis.people;
  if (mostActivePerson === undefined || secondPerson === undefined) {
    return null;
  }

  const lines = analysis.people
    .slice(0, PEOPLE_ON_RANKING_CARD)
    .map((person: PersonStatistics, index: number): string => {
      const count = formatCountWithNoun(person.messageCount, 'message', 'messages');
      const share = formatPercentage(person.messageCount / analysis.totalMessageCount);
      return `${index + 1}. ${person.name}: ${count}, ${share}`;
    });
  const isLevel = mostActivePerson.messageCount === secondPerson.messageCount;
  return {
    kind: 'people',
    label: 'Who wrote most',
    headline: isLevel
      ? `${mostActivePerson.name} and ${secondPerson.name} wrote exactly as much`
      : `${mostActivePerson.name} wrote the most`,
    lines,
  };
}

/**
 * The card of the rhythm: the hour of the week the chat was most alive in,
 * and the busiest weekday and hour taken on their own.
 */
function buildRhythmCard(analysis: ChatAnalysis): RecapCard | null {
  const heatmap = analysis.weekdayHourHeatmap;
  const busiestSlot = findBusiestSlot(heatmap);
  if (busiestSlot === null || busiestSlot.messageCount === 0) {
    return null;
  }
  const totalsByWeekday = heatmap.map((hourCounts: readonly number[]): number => sumOf(hourCounts));
  const totalsByHour = (heatmap[0] ?? []).map((_count: number, hour: number): number =>
    sumOf(heatmap.map((hourCounts: readonly number[]): number => hourCounts[hour] ?? 0)),
  );
  const busiestWeekdayIndex = findIndexOfLargest(totalsByWeekday) ?? busiestSlot.weekdayIndex;
  const busiestHour = padToTwoDigits(findIndexOfLargest(totalsByHour) ?? busiestSlot.hour);

  const slotCount = formatCountWithNoun(busiestSlot.messageCount, 'message', 'messages');
  return {
    kind: 'rhythm',
    label: 'The rhythm',
    headline: `Most alive on ${weekdayNameOf(busiestSlot.weekdayIndex)}s around ${padToTwoDigits(busiestSlot.hour)}:00`,
    lines: [
      `${slotCount} of the year landed in that one hour of the week.`,
      `Taken on their own, ${weekdayNameOf(busiestWeekdayIndex)} was the busiest weekday and ${busiestHour}:00 to ${busiestHour}:59 the busiest hour.`,
    ],
  };
}

/**
 * Finds the word or the emoji of a year.
 *
 * A term is distinctive when the year uses it at least one and a half times
 * as often as the rest of the chat does, measured by its share of all counted
 * terms. Among the distinctive ones the winner is the one with the most uses
 * beyond what the rest of the chat would lead one to expect, so a word the
 * year is full of beats a rare word that happens to be new. When the rest of
 * the chat is too small to compare with, or nothing stands out, the most
 * used term is taken and said to be just that.
 *
 * Only terms the whole chat still lists are considered. While names are
 * hidden, the whole chat has lost the words of every name it knows, so a
 * name cannot come back through a year that knows fewer people.
 *
 * @param yearCounts - How often each term was used in the year.
 * @param wholeChatCounts - How often each was used in the whole chat, the year included.
 * @param minimumOtherTermCount - How many terms the rest of the chat must hold to be compared with.
 * @returns The term, or `null` when none was used at least five times.
 */
export function findTermOfYear(
  yearCounts: ReadonlyMap<string, number>,
  wholeChatCounts: ReadonlyMap<string, number>,
  minimumOtherTermCount: number,
): TermOfYear | null {
  let yearTotal = 0;
  let mostUsed: TermOfYear | null = null;
  for (const [term, count] of yearCounts) {
    if (!wholeChatCounts.has(term)) {
      continue;
    }
    yearTotal += count;
    if (count >= MINIMUM_USES_FOR_TERM_OF_YEAR && (mostUsed === null || count > mostUsed.count)) {
      mostUsed = { term, count, kind: 'most-used', timesAsOften: null };
    }
  }

  const otherTotal = sumOf(wholeChatCounts.values()) - yearTotal;
  if (mostUsed === null || otherTotal < minimumOtherTermCount) {
    return mostUsed;
  }

  let mostDistinctive: TermOfYear | null = null;
  let largestExcess = 0;
  for (const [term, count] of yearCounts) {
    const wholeChatCount = wholeChatCounts.get(term);
    if (wholeChatCount === undefined || count < MINIMUM_USES_FOR_TERM_OF_YEAR) {
      continue;
    }
    const otherCount = Math.max(0, wholeChatCount - count);
    const expectedCount = (otherCount / otherTotal) * yearTotal;
    const excess = count - expectedCount;
    if (count >= MINIMUM_DISTINCTIVE_RATIO * expectedCount && excess > largestExcess) {
      largestExcess = excess;
      mostDistinctive = {
        term,
        count,
        kind: 'distinctive',
        timesAsOften: otherCount === 0 ? null : count / expectedCount,
      };
    }
  }
  return mostDistinctive ?? mostUsed;
}

/**
 * Writes how many times as often a term was used: one decimal below ten,
 * a whole number from there on.
 *
 * @param timesAsOften - The ratio of the uses to the expected uses.
 * @returns For example `"2.4"` or `"657"`.
 */
export function formatTimesAsOften(timesAsOften: number): string {
  if (timesAsOften < TIMES_AS_OFTEN_SHOWN_WHOLE) {
    return timesAsOften.toFixed(1);
  }
  return formatWholeNumber(timesAsOften);
}

/** The wording that differs between the card of the word and that of the emoji. */
interface TermCardWording {
  /** What the card is about. */
  readonly kind: 'word' | 'emoji';
  /** `"word"` or `"emoji"`. */
  readonly noun: string;
  /** `"Written"` or `"Sent"`. */
  readonly verb: string;
  /** What is left aside when the most used one is picked; empty when nothing is. */
  readonly mostUsedAside: string;
}

/**
 * Writes the card of a word or an emoji of the year, saying how it was picked.
 */
function buildTermCard(
  termOfYear: TermOfYear | null,
  wording: TermCardWording,
  year: number,
): RecapCard | null {
  if (termOfYear === null) {
    return null;
  }
  const { kind, noun, verb, mostUsedAside } = wording;
  const uses = formatCountWithNoun(termOfYear.count, 'time', 'times');
  const headline = kind === 'word' ? `“${termOfYear.term}”` : termOfYear.term;

  if (termOfYear.kind === 'most-used') {
    return {
      kind,
      label: `Most used ${noun}`,
      headline,
      lines: [
        `${verb} ${uses} in ${String(year)}, more than any other ${noun}${mostUsedAside}.`,
        `It is the ${noun} used most, not one picked for standing out.`,
      ],
    };
  }

  const comparison =
    termOfYear.timesAsOften === null
      ? `${verb} ${uses} in ${String(year)}, and never in the rest of the chat.`
      : `${verb} ${uses} in ${String(year)}: ${formatTimesAsOften(termOfYear.timesAsOften)} times as often as in the rest of the chat.`;
  return {
    kind,
    label: `${noun.charAt(0).toUpperCase()}${noun.slice(1)} of the year`,
    headline,
    lines: [
      comparison,
      `Picked as the ${noun} that sets ${String(year)} apart, not as the one used most.`,
    ],
  };
}

/**
 * The card of the longest streak; left out when no two days in a row had a message.
 */
function buildStreakCard(analysis: ChatAnalysis): RecapCard | null {
  const streak = analysis.longestStreak;
  if (streak.lengthInDays < SHORTEST_STREAK_WORTH_MENTIONING_IN_DAYS) {
    return null;
  }
  return {
    kind: 'streak',
    label: 'Longest streak',
    headline: `${formatWholeNumber(streak.lengthInDays)} days in a row`,
    lines: [
      `From ${formatLongDate(streak.from)} to ${formatLongDate(streak.to)}, not a day went by without a message.`,
    ],
  };
}

/**
 * The card of the titles: the first three awards of the year, by the rules
 * of the "Awards" section. Left out of a year in which one person wrote
 * alone and when nobody qualifies for a title.
 */
function buildAwardsCard(
  analysis: ChatAnalysis,
  peopleShown: PeopleShown,
  year: number,
): RecapCard | null {
  if (analysis.people.length < 2) {
    return null;
  }
  const awards = collectAwards(analysis, peopleShown).slice(0, AWARDS_ON_CARD);
  if (awards.length === 0) {
    return null;
  }
  return {
    kind: 'awards',
    label: 'All in good fun',
    headline: `The titles of ${String(year)}`,
    lines: awards.map(
      (award: Award): string => `${award.title}: ${award.winner.name} (${award.reason})`,
    ),
  };
}

/**
 * The closing card: how many people, conversations and words the year held.
 */
function buildClosingCard(analysis: ChatAnalysis, year: number): RecapCard {
  const people = formatCountWithNoun(analysis.people.length, 'person', 'people');
  const conversations = formatCountWithNoun(
    analysis.conversationCount,
    'conversation',
    'conversations',
  );
  const wordCount = sumOf(
    analysis.people.map((person: PersonStatistics): number => person.wordCount),
  );
  const words = formatCountWithNoun(wordCount, 'word', 'words');
  return {
    kind: 'closing',
    label: 'Until next year',
    headline: `That was ${String(year)}`,
    lines: [
      `${people}, ${conversations} and ${words} typed.`,
      'Thank you for a year of talking. Here is to the next one.',
    ],
  };
}

/**
 * Writes the cards of the recap of one year, in the order they are shown.
 *
 * @param yearAnalysis - The analysis of the messages of that year alone; its
 *   copy without names while "Hide names" is ticked.
 * @param context - The year's totals in the whole chat, the year before, the
 *   whole chat's words and emojis, and who competes for the titles.
 * @returns Between four and nine cards. The opening card, the peaks and the
 *   closing card are always there; the others need something to say.
 */
export function buildRecapCards(yearAnalysis: ChatAnalysis, context: RecapContext): RecapCard[] {
  const { year } = context.yearSummary;
  const wordOfYear = findTermOfYear(
    yearAnalysis.wordCounts,
    context.wholeChatAnalysis.wordCounts,
    MINIMUM_OTHER_WORDS_FOR_COMPARISON,
  );
  const emojiOfYear = findTermOfYear(
    yearAnalysis.emojiCounts,
    context.wholeChatAnalysis.emojiCounts,
    MINIMUM_OTHER_EMOJIS_FOR_COMPARISON,
  );

  const candidateCards: (RecapCard | null)[] = [
    buildMessagesCard(yearAnalysis, context),
    buildBusiestCard(yearAnalysis),
    buildPeopleCard(yearAnalysis),
    buildRhythmCard(yearAnalysis),
    buildTermCard(
      wordOfYear,
      {
        kind: 'word',
        noun: 'word',
        verb: 'Written',
        mostUsedAside: ', the small words every chat is full of aside',
      },
      year,
    ),
    buildTermCard(
      emojiOfYear,
      { kind: 'emoji', noun: 'emoji', verb: 'Sent', mostUsedAside: '' },
      year,
    ),
    buildStreakCard(yearAnalysis),
    buildAwardsCard(yearAnalysis, context.peopleShown, year),
    buildClosingCard(yearAnalysis, year),
  ];
  return candidateCards.filter((card: RecapCard | null): card is RecapCard => card !== null);
}
