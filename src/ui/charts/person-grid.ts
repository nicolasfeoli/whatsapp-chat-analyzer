/**
 * A grid of people by people: a row for each person, a column for each person,
 * and in every cell how often the person of the row did something towards the
 * person of the column (replied to them, mentioned them). Cells are tinted
 * within their row, so each row shows at a glance whom that person turns to
 * most. Plain HTML table, no SVG.
 */

import type { PersonStatistics } from '../../core/index';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { formatWholeNumber } from '../text-formatting';

/**
 * Returns how often the person of a row did something towards the person of a
 * column. Called once per cell that is not on the diagonal.
 */
export type CountBetweenPeople = (
  rowPerson: PersonStatistics,
  columnPerson: PersonStatistics,
) => number;

/**
 * A cell with a count of one is already tinted this many percent towards the
 * accent colour, so it is clearly told apart from an empty cell.
 */
const FAINTEST_TINT_PERCENT = 6;

/**
 * The remaining range of the tint, spread linearly up to the highest count of
 * the row. The strongest tint stays well below the full accent colour so the
 * number written on it remains readable in both colour schemes.
 */
const TINT_RANGE_PERCENT = 34;

/** What a cell on the diagonal shows: the grid does not count a person towards themselves. */
const OWN_CELL: SafeHtml = html`<td class="person-grid-own" aria-hidden="true">&middot;</td>`;

/** The empty cell above the row headings and to the left of the column headings. */
const CORNER_CELL: SafeHtml = html`<td></td>`;

/**
 * Finds the highest count in the row of one person, which is what the tints of
 * that row are scaled against. The cell on the diagonal is left out.
 */
function findLargestCountInRow(
  rowPerson: PersonStatistics,
  people: readonly PersonStatistics[],
  countBetween: CountBetweenPeople,
): number {
  let largestCount = 0;
  for (const columnPerson of people) {
    if (columnPerson !== rowPerson) {
      largestCount = Math.max(largestCount, countBetween(rowPerson, columnPerson));
    }
  }
  return largestCount;
}

/**
 * Tells whether a grid of these people would hold any count above zero, which
 * is what makes it worth drawing.
 *
 * @param people - The people of the rows and columns.
 * @param countBetween - Returns the count of a cell.
 * @returns `false` when every cell off the diagonal is zero.
 */
export function hasAnyCountBetweenPeople(
  people: readonly PersonStatistics[],
  countBetween: CountBetweenPeople,
): boolean {
  return people.some(
    (rowPerson: PersonStatistics): boolean =>
      findLargestCountInRow(rowPerson, people, countBetween) > 0,
  );
}

/**
 * Writes the `style` attribute that tints a cell, with its leading space. A
 * cell with a count of zero gets no attribute and keeps its plain background.
 */
function renderTintAttribute(count: number, largestCountInRow: number): SafeHtml {
  if (count <= 0) {
    return EMPTY_HTML;
  }
  const tintPercent = FAINTEST_TINT_PERCENT + (TINT_RANGE_PERCENT * count) / largestCountInRow;
  const roundedTintPercent = escapeHtml(tintPercent.toFixed(0));
  return html` style="background:color-mix(in oklab,var(--accent) ${roundedTintPercent}%,transparent)"`;
}

/**
 * Draws the row of one person: their name, then a cell per column. The full
 * name is repeated in a `title`, because a long name is cut short.
 */
function renderRow(
  rowPerson: PersonStatistics,
  people: readonly PersonStatistics[],
  countBetween: CountBetweenPeople,
  personColours: PersonColours,
): SafeHtml {
  const largestCountInRow = findLargestCountInRow(rowPerson, people, countBetween);
  const cellsHtml = joinHtml(
    people.map((columnPerson: PersonStatistics): SafeHtml => {
      if (columnPerson === rowPerson) {
        return OWN_CELL;
      }
      const count = countBetween(rowPerson, columnPerson);
      const tintAttribute = renderTintAttribute(count, largestCountInRow);
      return html`<td${tintAttribute}>${escapeHtml(formatWholeNumber(count))}</td>`;
    }),
  );
  const nameHtml = renderSwatchAndName(personColours, rowPerson.name);
  const title = escapeHtml(rowPerson.name);
  return html`<tr><th scope="row" title="${title}"><span class="person-grid-name">${nameHtml}</span></th>${cellsHtml}</tr>`;
}

/**
 * Draws the heading of one column: the name of its person. The full name is
 * repeated in a `title`, because a long name is cut short.
 */
function renderColumnHeading(columnPerson: PersonStatistics): SafeHtml {
  const name = escapeHtml(columnPerson.name);
  return html`<th scope="col" title="${name}"><span class="person-grid-name">${name}</span></th>`;
}

/**
 * Draws a grid of people by people.
 *
 * @param people - The people of the rows and the columns, in the order they should appear.
 * @param countBetween - Returns the count of a cell.
 * @param personColours - The colour assignment shared by all charts.
 * @returns A `<div class="table-wrapper">` holding a `<table class="person-grid">`, as markup.
 */
export function renderPersonGrid(
  people: readonly PersonStatistics[],
  countBetween: CountBetweenPeople,
  personColours: PersonColours,
): SafeHtml {
  const columnHeadingsHtml = joinHtml(people.map(renderColumnHeading));
  const rowsHtml = joinHtml(
    people.map((rowPerson: PersonStatistics): SafeHtml =>
      renderRow(rowPerson, people, countBetween, personColours),
    ),
  );
  const tableHtml = html`<table class="person-grid"><thead><tr>${CORNER_CELL}${columnHeadingsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  return html`<div class="table-wrapper">${tableHtml}</div>`;
}
