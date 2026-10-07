/**
 * A strip of small upright bars, one per slot of a short fixed scale: the
 * twenty-four hours of a day or the seven days of a week. It shows the shape
 * of one person's activity at a glance. Plain HTML and CSS, no SVG.
 *
 * The strip is a picture, so it is announced as one, with a sentence that
 * says what it shows. Each bar carries its slot and its count as a `title`
 * for the pointer, and the height of a bar, not its colour, is what says how
 * much.
 */

import { escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { formatCountWithNoun } from '../text-formatting';

/**
 * The smallest value the tallest bar is measured against. It only matters
 * when every bar is zero, where it prevents a division by zero and leaves all
 * bars empty.
 */
const SMALLEST_BAR_SCALE = 1e-9;

/** A bar that reaches the top of its track is this many percent high. */
const FULL_TRACK_HEIGHT_PERCENT = 100;

/** One bar of the strip. */
export interface BarStripBar {
  /** The short text under the bar, e.g. `"06"` or `"Mon"`; empty for a bar without one. Escaped here. */
  readonly axisLabel: string;
  /** What the bar stands for, in words, e.g. `"21:00 to 21:59"` or `"Saturday"`; escaped here. */
  readonly slotName: string;
  /** The number of messages the height of the bar represents. */
  readonly messageCount: number;
}

/**
 * Draws one bar in its track, with the label under it.
 */
function renderBarStripColumn(bar: BarStripBar, largestCount: number, colour: string): SafeHtml {
  const heightPercent = ((bar.messageCount / largestCount) * FULL_TRACK_HEIGHT_PERCENT).toFixed(1);
  const formattedCount = formatCountWithNoun(bar.messageCount, 'message', 'messages');
  const title = escapeHtml(`${bar.slotName}: ${formattedCount}`);
  const barStyle = html`height:${escapeHtml(heightPercent)}%;background:${escapeHtml(colour)}`;

  const trackHtml = html`<div class="bar-strip-track"><div class="bar-strip-bar" style="${barStyle}"></div></div>`;
  const labelHtml = html`<div class="bar-strip-label">${escapeHtml(bar.axisLabel)}</div>`;
  return html`<div class="bar-strip-column" title="${title}">${trackHtml}${labelHtml}</div>`;
}

/**
 * Draws a strip of upright bars. The tallest bar fills its track and the
 * others are scaled against it.
 *
 * @param bars - The bars, left to right.
 * @param colour - A CSS colour shared by all bars; escaped here.
 * @param description - A sentence that says what the strip shows, read out in
 *   place of the bars by a screen reader; escaped here.
 * @returns A `<div class="bar-strip">` element as markup.
 */
export function renderBarStrip(
  bars: readonly BarStripBar[],
  colour: string,
  description: string,
): SafeHtml {
  const counts = bars.map((bar: BarStripBar): number => bar.messageCount);
  const largestCount = Math.max(...counts, SMALLEST_BAR_SCALE);
  const columnsHtml = joinHtml(
    bars.map((bar: BarStripBar): SafeHtml => renderBarStripColumn(bar, largestCount, colour)),
  );
  return html`<div class="bar-strip" role="img" aria-label="${escapeHtml(description)}">${columnsHtml}</div>`;
}
