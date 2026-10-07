/**
 * The "Activity over time" section. The section itself is only a heading and
 * an empty container: the chart depends on the width of the page, so it is
 * drawn into the container afterwards by `drawTimeline` and redrawn on resize.
 */

import type { TimelineGranularity } from '../charts/timeline-buckets';
import { html } from '../html';
import type { SafeHtml } from '../html';
import { renderSectionHeading } from './section-heading';

/**
 * The `id` of the element the timeline chart is drawn into. Written with the
 * `html` tag because it is placed in markup; being a string, it also serves to
 * find the element again.
 */
export const TIMELINE_CONTAINER_ID: SafeHtml = html`timeline`;

/**
 * Draws the "Activity over time" section with its empty chart container.
 *
 * @param granularity - The length of time each bar covers, named in the caption.
 * @returns A `<section>` element as markup.
 */
export function renderTimelineSection(granularity: TimelineGranularity): SafeHtml {
  const headingHtml = renderSectionHeading(
    'Activity over time',
    `Messages per ${granularity}, stacked by person. Hover or tap a bar for the exact counts.`,
  );
  return html`<section>${headingHtml}<div id="${TIMELINE_CONTAINER_ID}"></div></section>`;
}
