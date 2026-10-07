/**
 * The "Who says what" section: a bar per person for their message count, and
 * a table with the detail behind it. The table has a column for edited
 * messages only when the export marks at least one message as edited.
 */

import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { renderHorizontalBars } from '../charts/horizontal-bars';
import type { HorizontalBarRow } from '../charts/horizontal-bars';
import { escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { colourOfPerson, renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { selectMostFrequent } from '../ranking';
import type { CountedEntry } from '../ranking';
import { formatPercentage, formatWholeNumber } from '../text-formatting';
import {
  DEFAULT_PEOPLE_SHOWN,
  renderPeopleShownNote,
  selectFeaturedPeople,
} from './featured-people';
import type { PeopleShown } from './featured-people';
import { renderSectionHeading } from './section-heading';

/** How many of a person's favourite emojis fit in the last column of the table. */
const TOP_EMOJIS_PER_PERSON = 4;

/** The column headings of the table up to the deleted messages, left to right. */
const LEADING_COLUMN_HEADINGS: readonly string[] = [
  'Person',
  'Messages',
  'Words',
  'Words / msg',
  'Media',
  'Emojis',
  'Questions',
  'Links',
  'Deleted',
];

/**
 * The heading of the column of edited messages. The column stands after the
 * deleted messages and is left out of an export that marks no message as
 * edited, where a column of zeros would read as "nobody ever edits" when the
 * truth may be that the export does not say.
 */
export const EDITED_COLUMN_HEADING = 'Edited';

/** The heading of the last column of the table. */
const TOP_EMOJIS_COLUMN_HEADING = 'Top emojis';

/** The single space that separates two emojis in the last column of the table. */
const EMOJI_SEPARATOR: SafeHtml = html` `;

/**
 * Builds the bar for one person: their message count and share of the chat.
 */
function buildMessageCountBar(
  person: PersonStatistics,
  totalMessageCount: number,
  personColours: PersonColours,
): HorizontalBarRow {
  const formattedCount = formatWholeNumber(person.messageCount);
  const share = formatPercentage(person.messageCount / totalMessageCount);
  return {
    label: person.name,
    value: person.messageCount,
    colour: colourOfPerson(personColours, person.name),
    /* Two spaces: the stylesheet preserves them to set the share apart from the count. */
    displayValue: `${formattedCount}  ${share}`,
  };
}

/**
 * Writes the average number of words in a person's typed messages.
 *
 * @param person - The person's statistics.
 * @returns The average with one decimal, for example `"6.4"`; `"0"` for
 *   somebody who never typed a message.
 */
export function formatWordsPerMessage(person: PersonStatistics): string {
  if (person.textMessageCount === 0) {
    return '0';
  }
  return (person.wordCount / person.textMessageCount).toFixed(1);
}

/**
 * Lists a person's most used emojis, separated by spaces.
 */
function renderTopEmojis(person: PersonStatistics): SafeHtml {
  const topEmojis = selectMostFrequent(person.emojiCounts, TOP_EMOJIS_PER_PERSON);
  return joinHtml(
    topEmojis.map((entry: CountedEntry<string>): SafeHtml => escapeHtml(entry.key)),
    EMOJI_SEPARATOR,
  );
}

/**
 * Tells whether the export marks any message of the chat as edited, counting
 * everybody and not only the people the table lists.
 *
 * @param people - Everyone in the chat.
 * @returns `true` when at least one person has an edited message.
 */
export function hasEditedMessages(people: readonly PersonStatistics[]): boolean {
  return people.some((person: PersonStatistics): boolean => person.editedMessageCount > 0);
}

/**
 * Lists the column headings of the table, left to right.
 */
function listColumnHeadings(showsEditedColumn: boolean): readonly string[] {
  const editedHeadings = showsEditedColumn ? [EDITED_COLUMN_HEADING] : [];
  return [...LEADING_COLUMN_HEADINGS, ...editedHeadings, TOP_EMOJIS_COLUMN_HEADING];
}

/**
 * Draws the table row of one person.
 */
function renderPersonRow(
  person: PersonStatistics,
  personColours: PersonColours,
  showsEditedColumn: boolean,
): SafeHtml {
  const editedCells: readonly SafeHtml[] = showsEditedColumn
    ? [escapeHtml(formatWholeNumber(person.editedMessageCount))]
    : [];
  const cells: readonly SafeHtml[] = [
    renderSwatchAndName(personColours, person.name),
    escapeHtml(formatWholeNumber(person.messageCount)),
    escapeHtml(formatWholeNumber(person.wordCount)),
    escapeHtml(formatWordsPerMessage(person)),
    escapeHtml(formatWholeNumber(person.mediaCount)),
    escapeHtml(formatWholeNumber(person.emojiCount)),
    escapeHtml(formatWholeNumber(person.questionCount)),
    escapeHtml(formatWholeNumber(person.linkCount)),
    escapeHtml(formatWholeNumber(person.deletedCount)),
    ...editedCells,
    renderTopEmojis(person),
  ];
  const cellsHtml = joinHtml(cells.map((cell: SafeHtml): SafeHtml => html`<td>${cell}</td>`));
  return html`<tr>${cellsHtml}</tr>`;
}

/**
 * Draws the table of per-person detail.
 */
function renderPeopleTable(
  featuredPeople: readonly PersonStatistics[],
  personColours: PersonColours,
  showsEditedColumn: boolean,
): SafeHtml {
  const headingsHtml = joinHtml(
    listColumnHeadings(showsEditedColumn).map(
      (heading: string): SafeHtml => html`<th>${escapeHtml(heading)}</th>`,
    ),
  );
  const rowsHtml = joinHtml(
    featuredPeople.map((person: PersonStatistics): SafeHtml =>
      renderPersonRow(person, personColours, showsEditedColumn),
    ),
  );
  return html`<div class="table-wrapper"><table><thead><tr>${headingsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
}

/**
 * Draws the "Who says what" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @param peopleShown - Whether to list the most active people only, or everyone.
 * @returns A `<section>` element as markup.
 */
export function renderPeopleSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
): SafeHtml {
  const featuredPeople = selectFeaturedPeople(analysis.people, peopleShown);
  const bars = featuredPeople.map((person: PersonStatistics): HorizontalBarRow =>
    buildMessageCountBar(person, analysis.totalMessageCount, personColours),
  );

  const headingHtml = renderSectionHeading(
    'Who says what',
    'Messages sent by each person, then the detail behind them.',
  );
  const barsHtml = renderHorizontalBars(bars);
  const tableHtml = renderPeopleTable(
    featuredPeople,
    personColours,
    hasEditedMessages(analysis.people),
  );
  const noteHtml = renderPeopleShownNote(featuredPeople.length, analysis.people.length);
  return html`<section>${headingHtml}${barsHtml}${tableHtml}${noteHtml}</section>`;
}
