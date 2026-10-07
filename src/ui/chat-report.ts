/**
 * Puts the sections of the report together, in the order they appear on the page.
 *
 * Everything here is a pure function from the analysis to an HTML string, so
 * the whole report can be rendered and inspected without a browser. The parts
 * that need a real page (measuring the width for the timeline, pointer events
 * for the tooltips) are connected afterwards by `page-controller.ts`.
 */

import type { ChatAnalysis } from '../core/index';
import { buildTimelineData } from './charts/timeline-buckets';
import type { TimelineData } from './charts/timeline-buckets';
import { joinHtml } from './html';
import type { SafeHtml } from './html';
import { assignPersonColours } from './person-colours';
import { renderHeatmapSection } from './sections/heatmap';
import { renderInsightsSection } from './sections/insights';
import { renderPeopleSection } from './sections/people';
import { renderRecordsSection } from './sections/records';
import { renderRepliesSection } from './sections/replies';
import { renderSummarySection } from './sections/summary';
import { renderTimelineSection } from './sections/timeline';
import { renderWordsAndEmojisSection } from './sections/words-and-emojis';

/** The report as markup, plus the data the page needs to draw the timeline into it. */
export interface RenderedChatReport {
  /** The markup of every section. The timeline section holds an empty container. */
  readonly html: SafeHtml;
  /** The bars of the timeline, to be drawn at the width the container turns out to have. */
  readonly timeline: TimelineData;
}

/**
 * Renders the whole report for an analysed chat.
 *
 * @param analysis - The analysed chat.
 * @param title - The name of the chat, usually taken from the file name; untrusted.
 * @returns The markup and the timeline data.
 */
export function renderChatReport(analysis: ChatAnalysis, title: string): RenderedChatReport {
  const personColours = assignPersonColours(analysis.people);
  const timeline = buildTimelineData(analysis, personColours);

  const sections: readonly SafeHtml[] = [
    renderSummarySection(analysis, title, personColours),
    renderInsightsSection(analysis),
    renderPeopleSection(analysis, personColours),
    renderTimelineSection(timeline.granularity),
    renderHeatmapSection(analysis),
    renderRepliesSection(analysis, personColours),
    renderWordsAndEmojisSection(analysis, personColours),
    renderRecordsSection(analysis, personColours),
  ];

  return { html: joinHtml(sections), timeline };
}
