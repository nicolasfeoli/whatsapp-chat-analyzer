/**
 * The horizontal bar chart used for message counts, reply times, conversation
 * starts and the most used words. Plain HTML and CSS, no SVG.
 */

import { escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';

/**
 * The smallest value the longest bar is measured against. It only matters
 * when every row is zero, where it prevents a division by zero and leaves all
 * bars empty.
 */
const SMALLEST_BAR_SCALE = 1e-9;

/** A bar that reaches the end of its track is this many percent wide. */
const FULL_TRACK_WIDTH_PERCENT = 100;

/** One row of the chart. */
export interface HorizontalBarRow {
  /** The text to the left of the bar; untrusted, it is escaped here. */
  readonly label: string;
  /** The number the length of the bar represents. */
  readonly value: number;
  /** A CSS colour for the bar; escaped here. */
  readonly colour: string;
  /** The text to the right of the bar, e.g. `"1,204  63%"`; escaped here. */
  readonly displayValue: string;
}

/**
 * Draws one row: label, bar in its track, and value.
 */
function renderHorizontalBarRow(row: HorizontalBarRow, largestValue: number): SafeHtml {
  const widthPercent = ((row.value / largestValue) * FULL_TRACK_WIDTH_PERCENT).toFixed(1);
  const label = escapeHtml(row.label);
  const barStyle = html`width:${escapeHtml(widthPercent)}%;background:${escapeHtml(row.colour)}`;

  const labelHtml = html`<div class="bar-label" title="${label}">${label}</div>`;
  const trackHtml = html`<div class="bar-track"><div class="bar" style="${barStyle}"></div></div>`;
  const valueHtml = html`<div class="bar-value">${escapeHtml(row.displayValue)}</div>`;
  return html`${labelHtml}${trackHtml}${valueHtml}`;
}

/**
 * Draws a horizontal bar chart. The longest bar fills its track and the others
 * are scaled against it.
 *
 * @param rows - The rows, in the order they should appear.
 * @returns A `<div class="horizontal-bars">` element as markup.
 */
export function renderHorizontalBars(rows: readonly HorizontalBarRow[]): SafeHtml {
  const values = rows.map((row: HorizontalBarRow): number => row.value);
  const largestValue = Math.max(...values, SMALLEST_BAR_SCALE);
  const rowsHtml = joinHtml(
    rows.map((row: HorizontalBarRow): SafeHtml => renderHorizontalBarRow(row, largestValue)),
  );
  return html`<div class="horizontal-bars">${rowsHtml}</div>`;
}
