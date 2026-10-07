/**
 * The "How each person writes" section: for every person listed, the share of
 * their typed messages that are a single word, the share that are emojis and
 * nothing else, and the length of their longest message. It tells the person
 * who answers "ok" from the one who writes paragraphs, and is only shown for a
 * chat with more than one sender in which somebody has typed enough.
 */

import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { escapeHtml, EMPTY_HTML, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { formatCountWithNoun, formatPercentage } from '../text-formatting';
import {
  DEFAULT_PEOPLE_SHOWN,
  renderPeopleShownNote,
  selectFeaturedPeople,
} from './featured-people';
import type { PeopleShown } from './featured-people';
import { renderSectionHeading } from './section-heading';

/**
 * A person needs at least this many typed messages before the two shares are
 * written for them. With fewer than fifty, one message more or less moves a
 * share by over two points, and "half of what they write is one word" would
 * be said of somebody who wrote "ok" three times out of six.
 */
export const MINIMUM_TEXT_MESSAGES_FOR_STYLE_SHARES = 50;

/** A chat with a single sender has nobody to compare a style with. */
const FEWEST_PEOPLE_TO_COMPARE = 2;

/** What a cell shows when there is nothing to measure. */
export const NO_VALUE = '–';

/** The column headings of the table, left to right. */
const TABLE_COLUMN_HEADINGS: readonly string[] = [
  'Person',
  'One-word messages',
  'Emoji-only messages',
  'Longest message',
];

/** How one person writes, as far as the table shows it. */
export interface TextingStyle {
  /** The share of the person's typed messages that are a single word, between 0 and 1. */
  readonly singleWordShare: number;
  /** The share of the person's typed messages that are emojis only, between 0 and 1. */
  readonly emojiOnlyShare: number;
}

/**
 * Works out the two shares of a person's typed messages.
 *
 * @param person - The person's statistics.
 * @returns The shares, or `null` for somebody with fewer than
 *   {@link MINIMUM_TEXT_MESSAGES_FOR_STYLE_SHARES} typed messages.
 */
export function findTextingStyle(person: PersonStatistics): TextingStyle | null {
  if (person.textMessageCount < MINIMUM_TEXT_MESSAGES_FOR_STYLE_SHARES) {
    return null;
  }
  return {
    singleWordShare: person.singleWordMessageCount / person.textMessageCount,
    emojiOnlyShare: person.emojiOnlyMessageCount / person.textMessageCount,
  };
}

/**
 * Writes a share of a person's typed messages. A share of nothing reads "0%",
 * since "0.0%" would suggest that a few such messages were rounded away.
 *
 * @param share - A share between 0 and 1.
 * @returns For example `"0%"`, `"4.5%"` or `"40%"`.
 */
export function formatStyleShare(share: number): string {
  if (share === 0) {
    return '0%';
  }
  return formatPercentage(share);
}

/**
 * Writes the length of a person's longest message.
 *
 * @param person - The person's statistics.
 * @returns For example `"212 words"` or `"1 word"`; a dash for somebody who
 *   never typed a word.
 */
export function formatLongestMessage(person: PersonStatistics): string {
  if (person.longestMessageWordCount === 0) {
    return NO_VALUE;
  }
  return formatCountWithNoun(person.longestMessageWordCount, 'word', 'words');
}

/**
 * Tells whether the section has anything to say: more than one sender, and at
 * least one of the people listed has typed enough for their shares to be written.
 *
 * @param people - Everyone in the chat.
 * @param featuredPeople - The people the section would list.
 * @returns `true` when the section is worth showing.
 */
export function hasTextingStyleWorthShowing(
  people: readonly PersonStatistics[],
  featuredPeople: readonly PersonStatistics[],
): boolean {
  if (people.length < FEWEST_PEOPLE_TO_COMPARE) {
    return false;
  }
  return featuredPeople.some(
    (person: PersonStatistics): boolean => findTextingStyle(person) !== null,
  );
}

/**
 * Draws the table row of one person: name, the two shares (or dashes for
 * somebody who has typed too little) and their longest message.
 */
function renderPersonRow(person: PersonStatistics, personColours: PersonColours): SafeHtml {
  const textingStyle = findTextingStyle(person);
  const cells: readonly SafeHtml[] = [
    renderSwatchAndName(personColours, person.name),
    escapeHtml(textingStyle === null ? NO_VALUE : formatStyleShare(textingStyle.singleWordShare)),
    escapeHtml(textingStyle === null ? NO_VALUE : formatStyleShare(textingStyle.emojiOnlyShare)),
    escapeHtml(formatLongestMessage(person)),
  ];
  const cellsHtml = joinHtml(cells.map((cell: SafeHtml): SafeHtml => html`<td>${cell}</td>`));
  return html`<tr>${cellsHtml}</tr>`;
}

/**
 * Draws the "How each person writes" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @param peopleShown - Whether to list the most active people only, or everyone.
 * @returns A `<section>` element as markup, or empty markup for a chat with a
 *   single sender or one in which nobody listed has typed enough.
 */
export function renderTextingStyleSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
): SafeHtml {
  const featuredPeople = selectFeaturedPeople(analysis.people, peopleShown);
  if (!hasTextingStyleWorthShowing(analysis.people, featuredPeople)) {
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
    'How each person writes',
    'How many of each person’s typed messages are a single word or nothing but emojis, and how long their longest one is.',
  );
  const tableHtml = html`<table><thead><tr>${headingsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  const explanation = `The percentages are shares of the messages that person typed; photos, stickers, voice notes and deleted messages are left out. A one-word message has exactly one word, whatever emojis or punctuation come with it, and no link. An emoji-only message has nothing but emojis. The shares are written from ${String(MINIMUM_TEXT_MESSAGES_FOR_STYLE_SHARES)} typed messages on; the longest message is counted in words, links aside.`;
  const explanationHtml = html`<p class="hint">${escapeHtml(explanation)}</p>`;
  const noteHtml = renderPeopleShownNote(featuredPeople.length, analysis.people.length);
  return html`<section>${headingHtml}<div class="table-wrapper">${tableHtml}</div>${explanationHtml}${noteHtml}</section>`;
}
