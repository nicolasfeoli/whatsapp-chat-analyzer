/**
 * A grid of people by people: a row for each person, a column for each person,
 * and in every cell what the person of the row did towards the person of the
 * column: how often they replied to them or mentioned them, or how fast they
 * typically answer them. Cells are tinted within their row, so each row shows
 * at a glance whom that person turns to most. Plain HTML table, no SVG.
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

/** What one cell of the grid shows. */
export interface PersonGridCell {
  /** What is written in the cell, such as `"1,200"` or `"4 min"`. */
  readonly text: string;
  /**
   * What the tint of the cell is driven by: the cell with the largest weight
   * of its row gets the strongest tint and the others a share of it. A cell
   * with a weight of zero or less is not tinted.
   */
  readonly weight: number;
  /** What the cell says when it is pointed at; left out for a cell that needs no explanation. */
  readonly title?: string;
}

/**
 * Returns what the cell of a row's person towards a column's person shows.
 * Called once per cell that is not on the diagonal.
 */
export type CellBetweenPeople = (
  rowPerson: PersonStatistics,
  columnPerson: PersonStatistics,
) => PersonGridCell;

/**
 * Finds the highest count in the row of one person. The cell on the diagonal
 * is left out.
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
 * cell with a weight of zero gets no attribute and keeps its plain background.
 */
function renderTintAttribute(weight: number, largestWeightInRow: number): SafeHtml {
  if (weight <= 0) {
    return EMPTY_HTML;
  }
  const tintPercent = FAINTEST_TINT_PERCENT + (TINT_RANGE_PERCENT * weight) / largestWeightInRow;
  const roundedTintPercent = escapeHtml(tintPercent.toFixed(0));
  return html` style="background:color-mix(in oklab,var(--accent) ${roundedTintPercent}%,transparent)"`;
}

/**
 * Writes the `title` attribute of a cell, with its leading space, or nothing
 * for a cell without a title.
 */
function renderTitleAttribute(cell: PersonGridCell): SafeHtml {
  if (cell.title === undefined) {
    return EMPTY_HTML;
  }
  return html` title="${escapeHtml(cell.title)}"`;
}

/**
 * Draws the row of one person: their name, then a cell per column, tinted
 * against the largest weight of the row. The full name is repeated in a
 * `title`, because a long name is cut short.
 */
function renderRow(
  rowPerson: PersonStatistics,
  people: readonly PersonStatistics[],
  cellBetween: CellBetweenPeople,
  personColours: PersonColours,
): SafeHtml {
  /* One entry per column; `null` stands for the cell on the diagonal. */
  const cells = people.map((columnPerson: PersonStatistics): PersonGridCell | null =>
    columnPerson === rowPerson ? null : cellBetween(rowPerson, columnPerson),
  );
  let largestWeightInRow = 0;
  for (const cell of cells) {
    largestWeightInRow = Math.max(largestWeightInRow, cell?.weight ?? 0);
  }

  const cellsHtml = joinHtml(
    cells.map((cell: PersonGridCell | null): SafeHtml => {
      if (cell === null) {
        return OWN_CELL;
      }
      const titleAttribute = renderTitleAttribute(cell);
      const tintAttribute = renderTintAttribute(cell.weight, largestWeightInRow);
      return html`<td${titleAttribute}${tintAttribute}>${escapeHtml(cell.text)}</td>`;
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
 * Draws a grid of people by people whose cells hold any text, such as a
 * duration, each tinted by its weight within its row.
 *
 * @param people - The people of the rows and the columns, in the order they should appear.
 * @param cellBetween - Returns the text, the weight and the title of a cell.
 * @param personColours - The colour assignment shared by all charts.
 * @returns A `<div class="table-wrapper">` holding a `<table class="person-grid">`, as markup.
 */
export function renderPersonGridOfCells(
  people: readonly PersonStatistics[],
  cellBetween: CellBetweenPeople,
  personColours: PersonColours,
): SafeHtml {
  const columnHeadingsHtml = joinHtml(people.map(renderColumnHeading));
  const rowsHtml = joinHtml(
    people.map((rowPerson: PersonStatistics): SafeHtml =>
      renderRow(rowPerson, people, cellBetween, personColours),
    ),
  );
  const tableHtml = html`<table class="person-grid"><thead><tr>${CORNER_CELL}${columnHeadingsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  return html`<div class="table-wrapper">${tableHtml}</div>`;
}

/**
 * Draws a grid of people by people whose cells hold a count: the count is
 * written as a whole number and is also what the cell is tinted by.
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
  const cellBetween: CellBetweenPeople = (rowPerson, columnPerson) => {
    const count = countBetween(rowPerson, columnPerson);
    return { text: formatWholeNumber(count), weight: count };
  };
  return renderPersonGridOfCells(people, cellBetween, personColours);
}
