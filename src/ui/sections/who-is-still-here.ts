/**
 * The "Who is still here" section: when each person wrote for the first and
 * for the last time, and how long they had been silent when the chat ends.
 * Somebody silent for long enough is marked as gone quiet, in words.
 *
 * "The end of the chat" is the last message of anybody in the export, not
 * today: an export made a year ago would otherwise show everyone as gone. The
 * section is only shown for a chat with more than one sender that is long
 * enough for a silence to mean something.
 */

import { calendarDaysBetween, startOfDay } from '../../core/index';
import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { formatCountWithNoun, formatLongDate } from '../text-formatting';
import {
  DEFAULT_PEOPLE_SHOWN,
  renderPeopleShownNote,
  selectFeaturedPeople,
} from './featured-people';
import type { PeopleShown } from './featured-people';
import { renderSectionHeading } from './section-heading';

/**
 * Somebody has gone quiet when they wrote nothing for more than this many
 * days before the end of the chat. Three months is longer than a holiday or
 * a busy stretch at work, which is as far as a number can tell absence from
 * a pause.
 */
export const QUIET_AFTER_DAYS = 90;

/**
 * The silence must also cover at least this share of the days the chat spans.
 * In a chat of ten years, people who write twice a year are part of how it
 * works; a quarter without them says nothing, a whole year does.
 */
export const QUIET_SHARE_OF_CHAT_SPAN = 0.1;

/**
 * A chat spanning fewer days than this (twice {@link QUIET_AFTER_DAYS}) does
 * not get the section. In a chat of four months, "silent for three" would
 * describe anybody who only wrote in its first weeks, which is how most short
 * chats look.
 */
export const SHORTEST_SPAN_FOR_PRESENCE_IN_DAYS = 180;

/** Silences shorter than this are written in days; from here on in months. */
const DAYS_WRITTEN_AS_MONTHS_FROM = 60;

/** Silences shorter than this (two years) are written in months; from here on in years. */
const DAYS_WRITTEN_AS_YEARS_FROM = 730;

/** The mean length of a month in days, a year of 365.25 days divided by twelve. */
const AVERAGE_DAYS_PER_MONTH = 30.4375;

/** The mean length of a year in days, leap years included. */
const AVERAGE_DAYS_PER_YEAR = 365.25;

/** What the status column reads for somebody who wrote near the end of the chat. */
export const STILL_WRITING_LABEL = 'Still writing';

/** What the status column reads for somebody who has gone quiet. */
export const GONE_QUIET_LABEL = 'Gone quiet';

/** The class of the status cell of somebody who has gone quiet, which the stylesheet mutes. */
const GONE_QUIET_CLASS = 'presence-gone-quiet';

/** The headings of the table, in the order of its columns. */
const COLUMN_HEADINGS: readonly string[] = [
  'Person',
  'First message',
  'Last message',
  'Silent at the end',
  'Status',
];

/**
 * Counts the calendar days between a person's last message and the last
 * message of the chat.
 *
 * @param person - The person's statistics.
 * @param analysis - The analysed chat.
 * @returns 0 when they wrote on the chat's last day, 1 for the day before, and so on.
 */
export function countSilentDaysAtEnd(person: PersonStatistics, analysis: ChatAnalysis): number {
  return calendarDaysBetween(
    startOfDay(person.lastMessageTimestamp),
    startOfDay(analysis.lastMessageTimestamp),
  );
}

/**
 * Tells whether a chat is long enough for a silence at its end to mean
 * something, and has somebody to be missed by.
 *
 * @param analysis - The analysed chat.
 * @returns `false` for a single sender or a span under 180 days.
 */
export function isPresenceWorthShowing(analysis: ChatAnalysis): boolean {
  const hasSeveralPeople = analysis.people.length > 1;
  return hasSeveralPeople && analysis.spanInDays >= SHORTEST_SPAN_FOR_PRESENCE_IN_DAYS;
}

/**
 * Tells whether a person has gone quiet: silent for more than ninety days and
 * for at least a tenth of the days the chat spans.
 *
 * @param person - The person's statistics.
 * @param analysis - The analysed chat.
 * @returns `false` as well for a chat in which nobody is judged; see
 *   {@link isPresenceWorthShowing}.
 */
export function hasGoneQuiet(person: PersonStatistics, analysis: ChatAnalysis): boolean {
  if (!isPresenceWorthShowing(analysis)) {
    return false;
  }
  const silentDays = countSilentDaysAtEnd(person, analysis);
  const isLongInDays = silentDays > QUIET_AFTER_DAYS;
  const isLongForThisChat = silentDays >= analysis.spanInDays * QUIET_SHARE_OF_CHAT_SPAN;
  return isLongInDays && isLongForThisChat;
}

/**
 * Writes the length of a silence the way a person would say it.
 *
 * @param silentDays - Whole days without a message.
 * @returns `"none"`, `"1 day"`, `"45 days"`, `"5 months"` or `"2.4 years"`.
 */
export function formatSilence(silentDays: number): string {
  if (silentDays <= 0) {
    return 'none';
  }
  if (silentDays < DAYS_WRITTEN_AS_MONTHS_FROM) {
    return formatCountWithNoun(silentDays, 'day', 'days');
  }
  if (silentDays < DAYS_WRITTEN_AS_YEARS_FROM) {
    return `${Math.round(silentDays / AVERAGE_DAYS_PER_MONTH)} months`;
  }
  return `${(silentDays / AVERAGE_DAYS_PER_YEAR).toFixed(1)} years`;
}

/**
 * Orders people by their last message, the most recent first. People whose
 * last messages were sent at the same moment keep their order.
 *
 * @param people - The people to order. The list is not modified.
 * @returns A new list.
 */
export function sortByLastMessage(people: readonly PersonStatistics[]): PersonStatistics[] {
  return [...people].sort(
    (firstPerson: PersonStatistics, secondPerson: PersonStatistics): number =>
      secondPerson.lastMessageTimestamp.getTime() - firstPerson.lastMessageTimestamp.getTime(),
  );
}

/**
 * Draws the status cell of one person: the words, muted for somebody gone quiet.
 */
function renderStatusCell(isQuiet: boolean): SafeHtml {
  if (isQuiet) {
    return html`<td class="${escapeHtml(GONE_QUIET_CLASS)}">${escapeHtml(GONE_QUIET_LABEL)}</td>`;
  }
  return html`<td>${escapeHtml(STILL_WRITING_LABEL)}</td>`;
}

/**
 * Draws the table row of one person: name, first message, last message,
 * silence and status.
 */
function renderPersonRow(
  person: PersonStatistics,
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  const cells: readonly SafeHtml[] = [
    renderSwatchAndName(personColours, person.name),
    escapeHtml(formatLongDate(person.firstMessageTimestamp)),
    escapeHtml(formatLongDate(person.lastMessageTimestamp)),
    escapeHtml(formatSilence(countSilentDaysAtEnd(person, analysis))),
  ];
  const cellsHtml = joinHtml(cells.map((cell: SafeHtml): SafeHtml => html`<td>${cell}</td>`));
  return html`<tr>${cellsHtml}${renderStatusCell(hasGoneQuiet(person, analysis))}</tr>`;
}

/**
 * Writes the sentence under the table that says what "gone quiet" means and
 * what the export cannot tell.
 */
function renderMethodNote(analysis: ChatAnalysis): SafeHtml {
  const lastDay = formatLongDate(analysis.lastMessageTimestamp);
  const note =
    `“${GONE_QUIET_LABEL}” means no message for more than ${String(QUIET_AFTER_DAYS)} days ` +
    `and for at least the last tenth of the chat, counted back from its last message on ${lastDay}. ` +
    'It does not mean somebody left the group: the status goes by messages alone, and who joined or left is listed under “Group history” when the export says so.';
  return html`<p class="hint">${escapeHtml(note)}</p>`;
}

/**
 * Draws the "Who is still here" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @param peopleShown - Whether to list the most active people only, or everyone.
 * @returns A `<section>` element as markup, or empty markup for a chat with a
 *   single sender or one spanning fewer than 180 days.
 */
export function renderWhoIsStillHereSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
): SafeHtml {
  if (!isPresenceWorthShowing(analysis)) {
    return EMPTY_HTML;
  }

  const featuredPeople = selectFeaturedPeople(analysis.people, peopleShown);
  const headingsHtml = joinHtml(
    COLUMN_HEADINGS.map((heading: string): SafeHtml => html`<th>${escapeHtml(heading)}</th>`),
  );
  const rowsHtml = joinHtml(
    sortByLastMessage(featuredPeople).map((person: PersonStatistics): SafeHtml =>
      renderPersonRow(person, analysis, personColours),
    ),
  );

  const headingHtml = renderSectionHeading(
    'Who is still here',
    'When each person first and last wrote, the most recent first.',
  );
  const tableHtml = html`<table><thead><tr>${headingsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  const peopleNoteHtml = renderPeopleShownNote(featuredPeople.length, analysis.people.length);
  return html`<section>${headingHtml}<div class="table-wrapper">${tableHtml}</div>${renderMethodNote(analysis)}${peopleNoteHtml}</section>`;
}
