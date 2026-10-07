/**
 * The "What gets sent" section: a table of how many photos, videos, voice
 * notes, stickers and so on each person sent. It is only shown when the
 * export says what at least one of its media placeholders stands for.
 */

import type { ChatAnalysis, MediaType, PersonStatistics } from '../../core/index';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { formatWholeNumber } from '../text-formatting';
import { selectFeaturedPeople } from './featured-people';
import { renderSectionHeading } from './section-heading';

/** One column of the table: a type of media and the heading it is shown under. */
interface MediaTypeColumn {
  readonly mediaType: MediaType;
  readonly heading: string;
}

/**
 * Every column the table can have, left to right. A column is only drawn when
 * somebody sent media of its type. "Not specified" comes last: it holds the
 * placeholders that do not say what they stand for.
 */
const MEDIA_TYPE_COLUMNS: readonly MediaTypeColumn[] = [
  { mediaType: 'photo', heading: 'Photos' },
  { mediaType: 'video', heading: 'Videos' },
  { mediaType: 'audio', heading: 'Voice and audio' },
  { mediaType: 'sticker', heading: 'Stickers' },
  { mediaType: 'gif', heading: 'GIFs' },
  { mediaType: 'document', heading: 'Documents' },
  { mediaType: 'contact', heading: 'Contacts' },
  { mediaType: 'poll', heading: 'Polls' },
  { mediaType: 'location', heading: 'Locations' },
  { mediaType: 'unknown', heading: 'Not specified' },
];

/** The heading of the first column, which holds the names. */
const PERSON_COLUMN_HEADING = 'Person';

/**
 * How many media messages of one type a person sent.
 *
 * @param person - The person's statistics.
 * @param mediaType - The type of media to look up.
 * @returns The count; zero when they sent none.
 */
export function mediaCountOfType(person: PersonStatistics, mediaType: MediaType): number {
  return person.mediaCountsByType.get(mediaType) ?? 0;
}

/**
 * Tells whether any of the people sent media of a type.
 */
function isTypeUsed(people: readonly PersonStatistics[], mediaType: MediaType): boolean {
  return people.some(
    (person: PersonStatistics): boolean => mediaCountOfType(person, mediaType) > 0,
  );
}

/**
 * Picks the columns worth drawing: the types somebody actually sent.
 */
function selectUsedColumns(people: readonly PersonStatistics[]): readonly MediaTypeColumn[] {
  return MEDIA_TYPE_COLUMNS.filter((column: MediaTypeColumn): boolean =>
    isTypeUsed(people, column.mediaType),
  );
}

/**
 * Draws the table row of one person: their name, then a count per column.
 */
function renderPersonRow(
  person: PersonStatistics,
  columns: readonly MediaTypeColumn[],
  personColours: PersonColours,
): SafeHtml {
  const countCellsHtml = joinHtml(
    columns.map((column: MediaTypeColumn): SafeHtml => {
      const formattedCount = formatWholeNumber(mediaCountOfType(person, column.mediaType));
      return html`<td>${escapeHtml(formattedCount)}</td>`;
    }),
  );
  const nameHtml = renderSwatchAndName(personColours, person.name);
  return html`<tr><td>${nameHtml}</td>${countCellsHtml}</tr>`;
}

/**
 * Draws the "What gets sent" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @returns A `<section>` element as markup, or empty markup when no
 *   placeholder of the export says what it stands for, as in an Android
 *   export made without media.
 */
export function renderMediaTypesSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  const featuredPeople = selectFeaturedPeople(analysis.people);
  const columns = selectUsedColumns(featuredPeople);
  const hasSpecifiedType = columns.some(
    (column: MediaTypeColumn): boolean => column.mediaType !== 'unknown',
  );
  if (!hasSpecifiedType) {
    return EMPTY_HTML;
  }

  const headings = [PERSON_COLUMN_HEADING, ...columns.map((column) => column.heading)];
  const headingsHtml = joinHtml(
    headings.map((heading: string): SafeHtml => html`<th>${escapeHtml(heading)}</th>`),
  );
  const rowsHtml = joinHtml(
    featuredPeople.map((person: PersonStatistics): SafeHtml =>
      renderPersonRow(person, columns, personColours),
    ),
  );

  const headingHtml = renderSectionHeading(
    'What gets sent',
    'Photos, stickers, voice notes and the rest, counted from the placeholders the export leaves in their place.',
  );
  const tableHtml = html`<table><thead><tr>${headingsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  return html`<section>${headingHtml}<div class="table-wrapper">${tableHtml}</div></section>`;
}
