/**
 * The "Who shows up" section: each person's longest run of days in a row with
 * a message of their own, and on how many of the chat's days they wrote at
 * all. The chat's own streak counts a day when anybody wrote; this one says
 * who it was that kept coming back.
 *
 * The section is only shown for a chat with more than one sender that spans
 * enough days for a run to mean something.
 */

import type { ChatAnalysis, LongestStreak, PersonStatistics } from '../../core/index';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import {
  formatCountWithNoun,
  formatLongDate,
  formatPercentage,
  formatWholeNumber,
} from '../text-formatting';
import {
  DEFAULT_PEOPLE_SHOWN,
  renderPeopleShownNote,
  selectFeaturedPeople,
} from './featured-people';
import type { PeopleShown } from './featured-people';
import { renderSectionHeading } from './section-heading';

/**
 * A chat spanning fewer days than this does not get the section. In a chat of
 * a week, everybody's longest run is a few days and says nothing about them.
 */
export const SHORTEST_SPAN_FOR_STREAKS_IN_DAYS = 14;

/** The headings of the table, in the order of its columns. */
const COLUMN_HEADINGS: readonly string[] = [
  'Person',
  'Longest streak',
  'When',
  'Days active',
  'Share of days',
];

/**
 * Tells whether a chat has somebody to compare and spans enough days for a
 * run of days to mean something.
 *
 * @param analysis - The analysed chat.
 * @returns `false` for a single sender or a span under fourteen days.
 */
export function areStreaksWorthShowing(analysis: ChatAnalysis): boolean {
  const hasSeveralPeople = analysis.people.length > 1;
  return hasSeveralPeople && analysis.spanInDays >= SHORTEST_SPAN_FOR_STREAKS_IN_DAYS;
}

/**
 * Writes the length of a run of days.
 *
 * @param streak - The run.
 * @returns For example `"1 day"` or `"23 days"`.
 */
export function formatStreakLength(streak: LongestStreak): string {
  return formatCountWithNoun(streak.lengthInDays, 'day', 'days');
}

/**
 * Writes when a run of days took place.
 *
 * @param streak - The run.
 * @returns For example `"3 Mar 2024 to 25 Mar 2024"`, or the one date of a
 *   run of a single day.
 */
export function formatStreakDates(streak: LongestStreak): string {
  const firstDay = formatLongDate(streak.from);
  if (streak.lengthInDays <= 1) {
    return firstDay;
  }
  return `${firstDay} to ${formatLongDate(streak.to)}`;
}

/**
 * Orders people by their longest streak, the longest first. People with
 * equally long streaks keep their order.
 *
 * @param people - The people to order. The list is not modified.
 * @returns A new list.
 */
export function sortByLongestStreak(people: readonly PersonStatistics[]): PersonStatistics[] {
  return [...people].sort(
    (firstPerson: PersonStatistics, secondPerson: PersonStatistics): number =>
      secondPerson.longestStreak.lengthInDays - firstPerson.longestStreak.lengthInDays,
  );
}

/**
 * Draws the table row of one person: name, longest streak, its dates, the
 * days they wrote on and the share of the chat's days that is.
 */
function renderPersonRow(
  person: PersonStatistics,
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  const shareOfDays = person.activeDayCount / analysis.spanInDays;
  const cells: readonly SafeHtml[] = [
    renderSwatchAndName(personColours, person.name),
    escapeHtml(formatStreakLength(person.longestStreak)),
    escapeHtml(formatStreakDates(person.longestStreak)),
    escapeHtml(formatWholeNumber(person.activeDayCount)),
    escapeHtml(formatPercentage(shareOfDays)),
  ];
  const cellsHtml = joinHtml(cells.map((cell: SafeHtml): SafeHtml => html`<td>${cell}</td>`));
  return html`<tr>${cellsHtml}</tr>`;
}

/**
 * Draws the "Who shows up" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @param peopleShown - Whether to list the most active people only, or everyone.
 * @returns A `<section>` element as markup, or empty markup for a chat with a
 *   single sender or one that spans under fourteen days.
 */
export function renderPersonStreaksSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
): SafeHtml {
  if (!areStreaksWorthShowing(analysis)) {
    return EMPTY_HTML;
  }

  const featuredPeople = selectFeaturedPeople(analysis.people, peopleShown);
  const headingsHtml = joinHtml(
    COLUMN_HEADINGS.map((heading: string): SafeHtml => html`<th>${escapeHtml(heading)}</th>`),
  );
  const rowsHtml = joinHtml(
    sortByLongestStreak(featuredPeople).map((person: PersonStatistics): SafeHtml =>
      renderPersonRow(person, analysis, personColours),
    ),
  );

  const spanInDays = formatCountWithNoun(analysis.spanInDays, 'day', 'days');
  const headingHtml = renderSectionHeading(
    'Who shows up',
    `Each person’s longest run of days in a row with at least one message of their own, and on how many of the ${spanInDays} the chat spans they wrote at all.`,
  );
  const tableHtml = html`<table><thead><tr>${headingsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  const noteHtml = renderPeopleShownNote(featuredPeople.length, analysis.people.length);
  return html`<section>${headingHtml}<div class="table-wrapper">${tableHtml}</div>${noteHtml}</section>`;
}
