/**
 * The "When the chat is alive" section: the weekday-by-hour heatmap and the
 * legend that says what the weakest and the strongest colour stand for.
 */

import type { ChatAnalysis } from '../../core/index';
import { findBusiestSlotCount, renderHeatmapGrid } from '../charts/heatmap';
import { escapeHtml, html } from '../html';
import type { SafeHtml } from '../html';
import { formatWholeNumber } from '../text-formatting';
import { renderSectionHeading } from './section-heading';

/**
 * Draws the "When the chat is alive" section.
 *
 * @param analysis - The analysed chat.
 * @returns A `<section>` element as markup.
 */
export function renderHeatmapSection(analysis: ChatAnalysis): SafeHtml {
  const heatmap = analysis.weekdayHourHeatmap;
  const busiestSlotCount = escapeHtml(formatWholeNumber(findBusiestSlotCount(heatmap)));

  const headingHtml = renderSectionHeading(
    'When the chat is alive',
    'Rows are the days of the week. Columns are the hours of the day, from midnight on the left to 23:00 on the right. Each square adds up every message sent in that hour on that weekday, and a stronger color means more. Hover or tap a square for its number.',
  );
  const gridHtml = renderHeatmapGrid(heatmap);
  const legendHtml = html`<div class="heatmap-legend">1<i></i>${busiestSlotCount} messages</div>`;
  return html`<section>${headingHtml}${gridHtml}${legendHtml}</section>`;
}
