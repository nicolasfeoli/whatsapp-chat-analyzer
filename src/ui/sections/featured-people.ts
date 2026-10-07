/**
 * Helpers shared by the sections that compare people with each other.
 */

import { formatDuration, median, MILLISECONDS_PER_MINUTE } from '../../core/index';
import type { PersonStatistics, TimestampResolution } from '../../core/index';
import { EMPTY_HTML, escapeHtml, html } from '../html';
import type { SafeHtml } from '../html';

/**
 * How many people the bar charts, the table and the comparisons show. In a
 * large group the long tail of people with a handful of messages would make
 * the charts unreadable, so only the eight most active are featured.
 */
export const FEATURED_PEOPLE_LIMIT = 8;

/**
 * A person needs at least this many measured replies before a typical reply
 * time is shown for them; the median of fewer values is mostly chance.
 */
export const MINIMUM_REPLIES_FOR_TYPICAL_DELAY = 5;

/** The wording used when a reply came within the same minute of a minute-resolution export. */
const UNDER_ONE_MINUTE_LABEL = 'under 1 min';

/** A person together with one number computed for them. */
export interface PersonWithValue {
  readonly person: PersonStatistics;
  readonly value: number;
}

/**
 * Whom the sections that compare people list: the most active only, which
 * keeps a large group readable, or everyone, for a group in which the people
 * who write little matter too.
 */
export type PeopleShown = 'most-active' | 'everyone';

/** What the report shows until the reader asks for everyone. */
export const DEFAULT_PEOPLE_SHOWN: PeopleShown = 'most-active';

/**
 * Picks the people who are shown individually.
 *
 * @param people - Everyone in the chat, most messages first.
 * @param peopleShown - Whether to stop at the most active.
 * @returns The first eight, or everyone when asked to.
 */
export function selectFeaturedPeople(
  people: readonly PersonStatistics[],
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
): readonly PersonStatistics[] {
  if (peopleShown === 'everyone') {
    return people;
  }
  return people.slice(0, FEATURED_PEOPLE_LIMIT);
}

/**
 * Writes the note that a section lists only part of the people, so the cut is
 * not mistaken for the whole chat.
 *
 * @param shownCount - How many people the section lists.
 * @param totalCount - How many people wrote in the chat.
 * @returns A `<p class="hint people-shown-note">` element as markup, or empty
 *   markup when nobody is left out.
 */
export function renderPeopleShownNote(shownCount: number, totalCount: number): SafeHtml {
  if (shownCount >= totalCount) {
    return EMPTY_HTML;
  }
  const note = `Showing the ${String(shownCount)} most active of ${String(totalCount)} people.`;
  return html`<p class="hint people-shown-note">${escapeHtml(note)}</p>`;
}

/**
 * Computes a number for each person and orders the people by it.
 *
 * @param people - The people to compare.
 * @param computeValue - Returns the number for a person, or `null` to leave them out.
 * @param direction - `'descending'` puts the highest value first, `'ascending'` the lowest.
 * @returns The people that have a value, in the requested order. People with
 *   equal values keep their original order.
 */
export function rankPeopleBy(
  people: readonly PersonStatistics[],
  computeValue: (person: PersonStatistics) => number | null,
  direction: 'ascending' | 'descending',
): PersonWithValue[] {
  const peopleWithValues: PersonWithValue[] = [];
  for (const person of people) {
    const value = computeValue(person);
    if (value !== null) {
      peopleWithValues.push({ person, value });
    }
  }

  peopleWithValues.sort((first: PersonWithValue, second: PersonWithValue): number => {
    if (direction === 'ascending') {
      return first.value - second.value;
    }
    return second.value - first.value;
  });
  return peopleWithValues;
}

/**
 * The median reply delay of a person, when they have replied often enough for
 * it to mean something.
 *
 * @param person - The person's statistics.
 * @returns The median in milliseconds, or `null` with fewer than five replies.
 */
export function typicalReplyDelayOf(person: PersonStatistics): number | null {
  if (person.replyDelaysInMilliseconds.length < MINIMUM_REPLIES_FOR_TYPICAL_DELAY) {
    return null;
  }
  return median(person.replyDelaysInMilliseconds);
}

/**
 * Writes a reply delay for display.
 *
 * Android exports only record the minute, so a reply sent within the same
 * minute has a delay of zero. Showing "1 s" for it would claim a precision the
 * file does not have, so such delays read "under 1 min".
 *
 * @param delayInMilliseconds - The delay to describe.
 * @param timestampResolution - Whether the export records seconds.
 * @returns For example `"under 1 min"`, `"45 s"` or `"12 min"`.
 */
export function formatReplyDelay(
  delayInMilliseconds: number,
  timestampResolution: TimestampResolution,
): string {
  const isRoundedToMinutes = timestampResolution === 'minute';
  if (isRoundedToMinutes && delayInMilliseconds < MILLISECONDS_PER_MINUTE) {
    return UNDER_ONE_MINUTE_LABEL;
  }
  return formatDuration(delayInMilliseconds);
}
