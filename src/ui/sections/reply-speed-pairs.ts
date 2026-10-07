/**
 * The "How fast each answers whom" section: the same grid as "Who answers
 * whom", holding the typical time the person of a row takes to answer the
 * person of a column instead of the number of replies. It is only shown for a
 * group, because in a chat of two it would repeat "Typical time to reply".
 */

import { median, MILLISECONDS_PER_MINUTE } from '../../core/index';
import type { ChatAnalysis, PersonStatistics, TimestampResolution } from '../../core/index';
import { renderPersonGridOfCells } from '../charts/person-grid';
import type { CellBetweenPeople, PersonGridCell } from '../charts/person-grid';
import { EMPTY_HTML, escapeHtml, html } from '../html';
import type { SafeHtml } from '../html';
import type { PersonColours } from '../person-colours';
import { formatWholeNumber } from '../text-formatting';
import {
  DEFAULT_PEOPLE_SHOWN,
  formatReplyDelay,
  MINIMUM_REPLIES_FOR_TYPICAL_DELAY,
  renderPeopleShownNote,
  selectFeaturedPeople,
} from './featured-people';
import type { PeopleShown } from './featured-people';
import { MINUTE_RESOLUTION_NOTE } from './replies';
import { SMALLEST_GROUP_SIZE } from './reply-pairs';
import { renderSectionHeading } from './section-heading';

/** What a cell shows when the pair has too few replies for a typical time. */
export const NO_TYPICAL_DELAY = '–';

/**
 * Added to every delay before speeds are compared, so that an answer within
 * the same second (or the same minute of an Android export, which records
 * nothing finer) does not count as infinitely fast. It also keeps answers of
 * a few seconds from looking far apart: under a minute, all of them are quick.
 */
const SPEED_FLOOR_IN_MILLISECONDS = MILLISECONDS_PER_MINUTE;

/** The empty list a pair without a single reply is read as. */
const NO_DELAYS: readonly number[] = [];

/**
 * Lists the delays of the replies one person wrote to another.
 *
 * @param replier - The person who wrote the replies.
 * @param recipientName - The name of the person whose messages were answered.
 * @returns The delays in milliseconds; empty when there were no replies.
 */
export function replyDelaysBetween(
  replier: PersonStatistics,
  recipientName: string,
): readonly number[] {
  return replier.replyDelaysByRecipient.get(recipientName) ?? NO_DELAYS;
}

/**
 * The median time one person takes to answer another, when they have answered
 * them often enough for it to mean something.
 *
 * @param replier - The person who wrote the replies.
 * @param recipientName - The name of the person whose messages were answered.
 * @returns The median in milliseconds, or `null` with fewer than five replies.
 */
export function typicalReplyDelayBetween(
  replier: PersonStatistics,
  recipientName: string,
): number | null {
  const delays = replyDelaysBetween(replier, recipientName);
  if (delays.length < MINIMUM_REPLIES_FOR_TYPICAL_DELAY) {
    return null;
  }
  return median(delays);
}

/**
 * Turns a typical delay into the weight a cell is tinted by, so that a faster
 * answer reads as stronger: the weight halves each time the delay, counted
 * from one minute, doubles.
 *
 * @param delayInMilliseconds - The typical delay of a pair; zero or more.
 * @returns A weight above zero, larger for a shorter delay.
 */
export function replySpeedWeightOf(delayInMilliseconds: number): number {
  return SPEED_FLOOR_IN_MILLISECONDS / (delayInMilliseconds + SPEED_FLOOR_IN_MILLISECONDS);
}

/**
 * Writes what a cell says when it is pointed at: how many replies its time
 * rests on, or why it holds a dash.
 */
function describeReplyCount(replyCount: number): string {
  if (replyCount === 0) {
    return 'No replies';
  }
  const replies = replyCount === 1 ? '1 reply' : `${formatWholeNumber(replyCount)} replies`;
  if (replyCount < MINIMUM_REPLIES_FOR_TYPICAL_DELAY) {
    return `${replies}, too few for a typical time`;
  }
  return `Median of ${replies}`;
}

/**
 * Builds the cell of one pair: the typical delay as text, tinted by its
 * speed, or a dash without a tint for a pair with too few replies.
 */
function buildReplySpeedCell(
  replier: PersonStatistics,
  recipient: PersonStatistics,
  timestampResolution: TimestampResolution,
): PersonGridCell {
  const title = describeReplyCount(replyDelaysBetween(replier, recipient.name).length);
  const typicalDelay = typicalReplyDelayBetween(replier, recipient.name);
  if (typicalDelay === null) {
    return { text: NO_TYPICAL_DELAY, weight: 0, title };
  }
  return {
    text: formatReplyDelay(typicalDelay, timestampResolution),
    weight: replySpeedWeightOf(typicalDelay),
    title,
  };
}

/**
 * Tells whether at least one pair of these people has a typical reply time,
 * which is what makes the grid worth drawing.
 *
 * @param people - The people of the rows and columns.
 * @returns `false` when every cell would hold a dash.
 */
export function hasAnyTypicalReplyDelayBetween(people: readonly PersonStatistics[]): boolean {
  return people.some((replier: PersonStatistics): boolean =>
    people.some(
      (recipient: PersonStatistics): boolean =>
        recipient !== replier && typicalReplyDelayBetween(replier, recipient.name) !== null,
    ),
  );
}

/**
 * Draws the "How fast each answers whom" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @param peopleShown - Whether to list the most active people only, or everyone.
 * @returns A `<section>` element as markup, or empty markup for a chat with
 *   fewer than three senders or in which no pair shown has replied often enough.
 */
export function renderReplySpeedPairsSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
): SafeHtml {
  const featuredPeople = selectFeaturedPeople(analysis.people, peopleShown);
  const isGroup = featuredPeople.length >= SMALLEST_GROUP_SIZE;
  if (!isGroup || !hasAnyTypicalReplyDelayBetween(featuredPeople)) {
    return EMPTY_HTML;
  }

  const cellBetween: CellBetweenPeople = (replier, recipient) =>
    buildReplySpeedCell(replier, recipient, analysis.timestampResolution);

  const headingHtml = renderSectionHeading(
    'How fast each answers whom',
    'Each row is a person, each column is whose message they answered, and the cell is the time they typically take: the median. The stronger the tint, the faster the answer, compared within the row.',
  );
  const gridHtml = renderPersonGridOfCells(featuredPeople, cellBetween, personColours);
  const explanation = `A pair needs ${String(MINIMUM_REPLIES_FOR_TYPICAL_DELAY)} replies before a time is written; a dash means there were fewer. As in "Who answers whom", a reply counts towards whoever wrote just before it, and an answer that took twelve hours or more is not counted.`;
  const explanationHtml = html`<p class="hint">${escapeHtml(explanation)}</p>`;
  const resolutionNoteHtml =
    analysis.timestampResolution === 'minute' ? MINUTE_RESOLUTION_NOTE : EMPTY_HTML;
  const noteHtml = renderPeopleShownNote(featuredPeople.length, analysis.people.length);
  return html`<section>${headingHtml}${gridHtml}${explanationHtml}${resolutionNoteHtml}${noteHtml}</section>`;
}
