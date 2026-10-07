/**
 * The rules of the "Awards" section: which title goes to whom, and for what.
 *
 * Every award is one entry of {@link AWARD_RULES}: a title, a number worked
 * out for each person, whether the highest or the lowest number wins, and the
 * words that put the winning number next to the name. Adding an award is
 * adding an entry. Nothing here touches the page, so the rules can be tested
 * on hand-made statistics.
 *
 * A person only takes part in an award when there is enough to go on: every
 * rule returns `null` for somebody below its threshold, and an award nobody
 * qualifies for is not given at all.
 */

import type { ChatAnalysis, MediaType, PersonStatistics } from '../core/index';
import { ratioWhenAtLeast } from './ranking';
import { formatCountWithNoun, formatPercentage, formatWholeNumber } from './text-formatting';
import {
  DEFAULT_PEOPLE_SHOWN,
  formatReplyDelay,
  selectFeaturedPeople,
  typicalReplyDelayOf,
} from './sections/featured-people';
import type { PeopleShown, PersonWithValue } from './sections/featured-people';
import {
  MINIMUM_MESSAGES_FOR_NIGHT_OWL,
  MINIMUM_NIGHT_SHARE_FOR_NIGHT_OWL,
  MINIMUM_TEXT_MESSAGES_FOR_WRITING_HABITS,
} from './sections/insights';

/**
 * A person needs to have sent this many stickers, photos or voice messages
 * before a title is given for them. Three stickers in a chat where nobody else
 * sends any do not make a "sticker dealer".
 */
export const MINIMUM_MEDIA_FOR_AWARD = 10;

/**
 * A person needs to have opened, or closed, this many conversations before a
 * title is given for it; in a chat of three conversations the count is chance.
 */
export const MINIMUM_CONVERSATIONS_FOR_AWARD = 5;

/**
 * A person needs this many questions left without an answer before a title is
 * given for them; one or two happen to everybody.
 */
export const MINIMUM_UNANSWERED_QUESTIONS_FOR_AWARD = 3;

/** Whether the highest or the lowest number takes an award. */
export type AwardPreference = 'highest' | 'lowest';

/** One award: its title, the number it compares, and how that number is put into words. */
export interface AwardRule {
  /** The title given to the winner, e.g. `"The night owl"`. */
  readonly title: string;
  /** Whether the person with the highest or with the lowest score wins. */
  readonly preference: AwardPreference;
  /**
   * Works out the number the award compares.
   *
   * @param person - The statistics of one person.
   * @param analysis - The analysed chat, for the numbers that concern everybody.
   * @returns The score, or `null` when the person has too little data to take part.
   */
  readonly scoreOf: (person: PersonStatistics, analysis: ChatAnalysis) => number | null;
  /**
   * Puts the winning score into words that read well after the winner's name.
   *
   * @param score - The winner's score, as {@link AwardRule.scoreOf} returned it.
   * @param analysis - The analysed chat.
   * @returns Plain text, for example `"31% of their messages are sent between midnight and 5:00"`.
   */
  readonly describe: (score: number, analysis: ChatAnalysis) => string;
}

/** An award that was given: the title, who took it, and the number that earned it. */
export interface Award {
  /** The title of the award. */
  readonly title: string;
  /** The person who takes it. */
  readonly winner: PersonStatistics;
  /** The winning number in words; plain text that still has to be escaped. */
  readonly reason: string;
}

/**
 * Lets a count take part in an award only from a minimum on.
 *
 * @param count - What was counted for a person.
 * @param minimumCount - The smallest count worth a title.
 * @returns The count, or `null` below the minimum.
 */
export function countWhenAtLeast(count: number, minimumCount: number): number | null {
  return count >= minimumCount ? count : null;
}

/**
 * The share of a person's typed messages that have some property, for the
 * awards about writing habits.
 *
 * @param matchingMessageCount - The typed messages that have the property.
 * @param person - The person's statistics.
 * @returns The share, or `null` when the person typed fewer than ten messages
 *   or none of them has the property.
 */
function shareOfTextMessages(
  matchingMessageCount: number,
  person: PersonStatistics,
): number | null {
  if (matchingMessageCount === 0) {
    return null;
  }
  return ratioWhenAtLeast(
    matchingMessageCount,
    person.textMessageCount,
    MINIMUM_TEXT_MESSAGES_FOR_WRITING_HABITS,
  );
}

/**
 * How many media messages of one type a person sent, when it is enough for a title.
 *
 * @param person - The person's statistics.
 * @param mediaType - The type of media the award is about.
 * @returns The count, or `null` below ten.
 */
function mediaCountForAward(person: PersonStatistics, mediaType: MediaType): number | null {
  return countWhenAtLeast(person.mediaCountsByType.get(mediaType) ?? 0, MINIMUM_MEDIA_FOR_AWARD);
}

/**
 * The share of a person's messages sent between midnight and 5:00, under the
 * same conditions as the night-owl sentence of "What stands out".
 *
 * @param person - The person's statistics.
 * @returns The share, or `null` with fewer than twenty messages or a share below 3%.
 */
function nightShareForAward(person: PersonStatistics): number | null {
  const nightShare = ratioWhenAtLeast(
    person.nightMessageCount,
    person.messageCount,
    MINIMUM_MESSAGES_FOR_NIGHT_OWL,
  );
  if (nightShare === null || nightShare < MINIMUM_NIGHT_SHARE_FOR_NIGHT_OWL) {
    return null;
  }
  return nightShare;
}

/**
 * The awards the report gives, in the order they are shown. Each one rests on
 * a number another section of the report already shows.
 */
export const AWARD_RULES: readonly AwardRule[] = [
  {
    title: 'The night owl',
    preference: 'highest',
    scoreOf: nightShareForAward,
    describe: (score: number): string =>
      `${formatPercentage(score)} of their messages are sent between midnight and 5:00`,
  },
  {
    title: 'The novelist',
    preference: 'highest',
    scoreOf: (person: PersonStatistics): number | null =>
      ratioWhenAtLeast(
        person.wordCount,
        person.textMessageCount,
        MINIMUM_TEXT_MESSAGES_FOR_WRITING_HABITS,
      ),
    describe: (score: number): string => `${score.toFixed(1)} words per message on average`,
  },
  {
    title: 'The lightning',
    preference: 'lowest',
    scoreOf: typicalReplyDelayOf,
    describe: (score: number, analysis: ChatAnalysis): string =>
      `typically replies in ${formatReplyDelay(score, analysis.timestampResolution)}`,
  },
  {
    title: 'The opener',
    preference: 'highest',
    scoreOf: (person: PersonStatistics): number | null =>
      countWhenAtLeast(person.conversationsStartedCount, MINIMUM_CONVERSATIONS_FOR_AWARD),
    describe: (score: number, analysis: ChatAnalysis): string =>
      `started ${formatWholeNumber(score)} of the ${formatWholeNumber(analysis.conversationCount)} conversations`,
  },
  {
    title: 'The last word',
    preference: 'highest',
    scoreOf: (person: PersonStatistics): number | null =>
      countWhenAtLeast(person.conversationsEndedCount, MINIMUM_CONVERSATIONS_FOR_AWARD),
    describe: (score: number): string =>
      `wrote the last message of ${formatWholeNumber(score)} conversations`,
  },
  {
    title: 'The sticker dealer',
    preference: 'highest',
    scoreOf: (person: PersonStatistics): number | null => mediaCountForAward(person, 'sticker'),
    describe: (score: number): string => `${formatWholeNumber(score)} stickers sent`,
  },
  {
    title: 'The photographer',
    preference: 'highest',
    scoreOf: (person: PersonStatistics): number | null => mediaCountForAward(person, 'photo'),
    describe: (score: number): string => `${formatWholeNumber(score)} photos sent`,
  },
  {
    title: 'The voice',
    preference: 'highest',
    scoreOf: (person: PersonStatistics): number | null => mediaCountForAward(person, 'audio'),
    describe: (score: number): string =>
      `${formatWholeNumber(score)} voice and audio messages sent`,
  },
  {
    title: 'The comedian',
    preference: 'highest',
    scoreOf: (person: PersonStatistics): number | null =>
      shareOfTextMessages(person.laughingMessageCount, person),
    describe: (score: number): string =>
      `${formatPercentage(score)} of their messages contain a laugh such as jaja or haha`,
  },
  {
    title: 'The question mark',
    preference: 'highest',
    scoreOf: (person: PersonStatistics): number | null =>
      shareOfTextMessages(person.questionCount, person),
    describe: (score: number): string =>
      `${formatPercentage(score)} of their messages ask a question`,
  },
  {
    title: 'The emoji fan',
    preference: 'highest',
    scoreOf: (person: PersonStatistics): number | null =>
      shareOfTextMessages(person.emojiCount, person),
    describe: (score: number): string => `${score.toFixed(1)} emojis per typed message`,
  },
  {
    title: 'The cliffhanger',
    preference: 'highest',
    scoreOf: (person: PersonStatistics): number | null =>
      countWhenAtLeast(person.unansweredQuestionCount, MINIMUM_UNANSWERED_QUESTIONS_FOR_AWARD),
    describe: (score: number): string =>
      `${formatCountWithNoun(score, 'question', 'questions')} still waiting for an answer`,
  },
];

/**
 * Tells whether one score beats another under a rule.
 */
function isBetterScore(score: number, bestScore: number, preference: AwardPreference): boolean {
  return preference === 'highest' ? score > bestScore : score < bestScore;
}

/**
 * Finds who takes an award.
 *
 * @param rule - The award.
 * @param people - The people compared, most messages first.
 * @param analysis - The analysed chat.
 * @returns The winner with their score, or `null` when nobody qualifies. Of
 *   two people with the same score the one listed first wins, which is the
 *   one who wrote more messages.
 */
export function findAwardWinner(
  rule: AwardRule,
  people: readonly PersonStatistics[],
  analysis: ChatAnalysis,
): PersonWithValue | null {
  let winner: PersonWithValue | null = null;
  for (const person of people) {
    const score = rule.scoreOf(person, analysis);
    if (score === null) {
      continue;
    }
    if (winner === null || isBetterScore(score, winner.value, rule.preference)) {
      winner = { person, value: score };
    }
  }
  return winner;
}

/**
 * Gives out the awards of a chat.
 *
 * @param analysis - The analysed chat.
 * @param peopleShown - Whether the most active people compete, or everyone.
 * @param rules - The awards to give; all of them unless stated.
 * @returns One entry per award somebody qualifies for, in the order of the rules.
 */
export function collectAwards(
  analysis: ChatAnalysis,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
  rules: readonly AwardRule[] = AWARD_RULES,
): Award[] {
  const competitors = selectFeaturedPeople(analysis.people, peopleShown);
  const awards: Award[] = [];
  for (const rule of rules) {
    const winner = findAwardWinner(rule, competitors, analysis);
    if (winner !== null) {
      awards.push({
        title: rule.title,
        winner: winner.person,
        reason: rule.describe(winner.value, analysis),
      });
    }
  }
  return awards;
}
