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
import { renderAwardsSection } from './sections/awards';
import { renderCalendarSection } from './sections/calendar';
import { DEFAULT_PEOPLE_SHOWN } from './sections/featured-people';
import type { PeopleShown } from './sections/featured-people';
import { renderConversationEndingsSection } from './sections/conversation-endings';
import { renderHeatmapSection } from './sections/heatmap';
import { renderInsightsSection } from './sections/insights';
import { renderMediaTypesSection } from './sections/media-types';
import { renderMentionsSection } from './sections/mentions';
import { renderMilestonesSection } from './sections/milestones';
import { renderPeakTimesSection } from './sections/peak-times';
import { renderPeopleSection } from './sections/people';
import {
  DEFAULT_PROFILED_PERSON_INDEX,
  renderPersonProfileSection,
} from './sections/person-profile';
import { renderRecordsSection } from './sections/records';
import { renderRepliesSection } from './sections/replies';
import { renderReplyPairsSection } from './sections/reply-pairs';
import { renderReplySpeedPairsSection } from './sections/reply-speed-pairs';
import { renderSharedSitesSection } from './sections/shared-sites';
import { renderSummarySection } from './sections/summary';
import { renderTextingStyleSection } from './sections/texting-style';
import { renderThenAndNowSection } from './sections/then-and-now';
import { renderTimelineSection } from './sections/timeline';
import { renderWhoIsStillHereSection } from './sections/who-is-still-here';
import { renderWordSearchSection } from './sections/word-search';
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
 * @param peopleShown - Whether the sections that compare people list the most active only, or everyone.
 * @param profiledPersonIndex - The position, in `analysis.people`, of the person
 *   "One person up close" starts with; the most active one unless stated.
 * @returns The markup and the timeline data.
 */
export function renderChatReport(
  analysis: ChatAnalysis,
  title: string,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
  profiledPersonIndex: number = DEFAULT_PROFILED_PERSON_INDEX,
): RenderedChatReport {
  const personColours = assignPersonColours(analysis.people);
  const timeline = buildTimelineData(analysis, personColours);

  const sections: readonly SafeHtml[] = [
    renderSummarySection(analysis, title, personColours),
    renderInsightsSection(analysis, peopleShown),
    renderAwardsSection(analysis, personColours, peopleShown),
    renderPeopleSection(analysis, personColours, peopleShown),
    renderMediaTypesSection(analysis, personColours, peopleShown),
    renderTimelineSection(timeline.granularity),
    renderCalendarSection(analysis),
    renderThenAndNowSection(analysis, personColours, peopleShown),
    renderWhoIsStillHereSection(analysis, personColours, peopleShown),
    renderHeatmapSection(analysis),
    renderPeakTimesSection(analysis, personColours, peopleShown),
    renderRepliesSection(analysis, personColours, peopleShown),
    renderReplyPairsSection(analysis, personColours, peopleShown),
    renderReplySpeedPairsSection(analysis, personColours, peopleShown),
    renderMentionsSection(analysis, personColours, peopleShown),
    renderConversationEndingsSection(analysis, personColours, peopleShown),
    renderTextingStyleSection(analysis, personColours, peopleShown),
    renderWordsAndEmojisSection(analysis, personColours, peopleShown),
    renderWordSearchSection(analysis),
    renderSharedSitesSection(analysis, personColours, peopleShown),
    renderPersonProfileSection(analysis, personColours, profiledPersonIndex),
    renderMilestonesSection(analysis, personColours),
    renderRecordsSection(analysis, personColours),
  ];

  return { html: joinHtml(sections), timeline };
}
