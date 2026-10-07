/**
 * The "When each person writes" section: for every person listed, the weekday
 * and the hour of the day in which they send most of their messages, written
 * as "Mostly on Sundays, around 23:00", with the share of their messages that
 * falls there. It follows the heatmap of the whole chat and is only shown for
 * a chat with more than one sender in which somebody has written enough.
 */

import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { escapeHtml, EMPTY_HTML, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { findIndexOfLargest } from '../ranking';
import { formatPercentage, padToTwoDigits, weekdayNameOf } from '../text-formatting';
import {
  DEFAULT_PEOPLE_SHOWN,
  renderPeopleShownNote,
  selectFeaturedPeople,
} from './featured-people';
import type { PeopleShown } from './featured-people';
import { renderSectionHeading } from './section-heading';

/**
 * A person needs at least this many messages before their busiest weekday and
 * hour are named. The messages are spread over twenty-four hours, so with
 * fewer than a hundred the fullest hour holds a handful of them and which
 * hour that is changes with every few messages.
 */
export const MINIMUM_MESSAGES_FOR_PEAK_TIMES = 100;

/** A chat with a single sender has its times in the heatmap already. */
const FEWEST_PEOPLE_TO_COMPARE = 2;

/** What the row of a person with too few messages says instead of a weekday and an hour. */
export const TOO_FEW_MESSAGES_LABEL = 'Too few messages to say';

/** What a share cell shows when there is no peak to measure. */
const NO_VALUE = '–';

/** The column headings of the table, left to right. */
const TABLE_COLUMN_HEADINGS: readonly string[] = [
  'Person',
  'Writes',
  'Sent on that weekday',
  'Sent in that hour',
];

/** The weekday and the hour of the day in which a person writes most. */
export interface PeakTimes {
  /** The busiest weekday: 0 for Monday up to 6 for Sunday. */
  readonly weekdayIndex: number;
  /** The share of the person's messages sent on that weekday, between 0 and 1. */
  readonly weekdayShare: number;
  /** The busiest hour of the day, 0 to 23. */
  readonly hour: number;
  /** The share of the person's messages sent in that hour, between 0 and 1. */
  readonly hourShare: number;
}

/**
 * Finds the weekday and the hour in which a person writes most. The two are
 * found separately, each over all of the person's messages; the earliest
 * weekday and the earliest hour win a tie.
 *
 * @param person - The person's statistics.
 * @returns The two peaks with their shares, or `null` for somebody with fewer
 *   than {@link MINIMUM_MESSAGES_FOR_PEAK_TIMES} messages.
 */
export function findPeakTimes(person: PersonStatistics): PeakTimes | null {
  if (person.messageCount < MINIMUM_MESSAGES_FOR_PEAK_TIMES) {
    return null;
  }
  const weekdayIndex = findIndexOfLargest(person.messageCountsByWeekday);
  const hour = findIndexOfLargest(person.messageCountsByHour);
  if (weekdayIndex === null || hour === null) {
    return null;
  }
  return {
    weekdayIndex,
    weekdayShare: (person.messageCountsByWeekday[weekdayIndex] ?? 0) / person.messageCount,
    hour,
    hourShare: (person.messageCountsByHour[hour] ?? 0) / person.messageCount,
  };
}

/**
 * Writes the peaks of a person as a phrase.
 *
 * @param peakTimes - The busiest weekday and hour of a person.
 * @returns For example `"Mostly on Sundays, around 23:00"`.
 */
export function describePeakTimes(peakTimes: PeakTimes): string {
  const weekdayName = weekdayNameOf(peakTimes.weekdayIndex);
  return `Mostly on ${weekdayName}s, around ${padToTwoDigits(peakTimes.hour)}:00`;
}

/**
 * Tells whether the section has anything to say: more than one sender, and at
 * least one of the people listed has enough messages for a peak to be named.
 *
 * @param people - Everyone in the chat.
 * @param featuredPeople - The people the section would list.
 * @returns `true` when the section is worth showing.
 */
export function hasPeakTimesWorthShowing(
  people: readonly PersonStatistics[],
  featuredPeople: readonly PersonStatistics[],
): boolean {
  if (people.length < FEWEST_PEOPLE_TO_COMPARE) {
    return false;
  }
  return featuredPeople.some((person: PersonStatistics): boolean => findPeakTimes(person) !== null);
}

/**
 * Draws the table row of one person: name, the phrase, and the two shares; or
 * the name and a note for somebody who has written too little.
 */
function renderPersonRow(person: PersonStatistics, personColours: PersonColours): SafeHtml {
  const nameHtml = renderSwatchAndName(personColours, person.name);
  const peakTimes = findPeakTimes(person);
  if (peakTimes === null) {
    const noValue = escapeHtml(NO_VALUE);
    return html`<tr><td>${nameHtml}</td><td class="peak-times-unknown">${escapeHtml(TOO_FEW_MESSAGES_LABEL)}</td><td>${noValue}</td><td>${noValue}</td></tr>`;
  }

  const cells: readonly SafeHtml[] = [
    nameHtml,
    escapeHtml(describePeakTimes(peakTimes)),
    escapeHtml(formatPercentage(peakTimes.weekdayShare)),
    escapeHtml(formatPercentage(peakTimes.hourShare)),
  ];
  const cellsHtml = joinHtml(cells.map((cell: SafeHtml): SafeHtml => html`<td>${cell}</td>`));
  return html`<tr>${cellsHtml}</tr>`;
}

/**
 * Draws the "When each person writes" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @param peopleShown - Whether to list the most active people only, or everyone.
 * @returns A `<section>` element as markup, or empty markup for a chat with a
 *   single sender or one in which nobody listed has written enough.
 */
export function renderPeakTimesSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
): SafeHtml {
  const featuredPeople = selectFeaturedPeople(analysis.people, peopleShown);
  if (!hasPeakTimesWorthShowing(analysis.people, featuredPeople)) {
    return EMPTY_HTML;
  }

  const headingsHtml = joinHtml(
    TABLE_COLUMN_HEADINGS.map((heading: string): SafeHtml => html`<th>${escapeHtml(heading)}</th>`),
  );
  const rowsHtml = joinHtml(
    featuredPeople.map((person: PersonStatistics): SafeHtml =>
      renderPersonRow(person, personColours),
    ),
  );

  const headingHtml = renderSectionHeading(
    'When each person writes',
    'The weekday and the hour of the day in which each person sends most of their messages.',
  );
  const tableHtml = html`<table><thead><tr>${headingsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  const explanation = `The weekday and the hour are counted separately, so "Sundays, around 23:00" does not say that Sunday at 23:00 is the busiest moment. The percentages are shares of that person’s own messages; spread evenly, a weekday would hold 14% and an hour 4.2%. A person is placed from ${String(MINIMUM_MESSAGES_FOR_PEAK_TIMES)} messages on.`;
  const explanationHtml = html`<p class="hint">${escapeHtml(explanation)}</p>`;
  const noteHtml = renderPeopleShownNote(featuredPeople.length, analysis.people.length);
  return html`<section>${headingHtml}<div class="table-wrapper">${tableHtml}</div>${explanationHtml}${noteHtml}</section>`;
}
