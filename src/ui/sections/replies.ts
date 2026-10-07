/**
 * The "Replies and openings" section: how long each person typically takes to
 * reply, and how many conversations each person started. It is only shown for
 * a chat with more than one sender.
 */

import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { renderHorizontalBars } from '../charts/horizontal-bars';
import type { HorizontalBarRow } from '../charts/horizontal-bars';
import { EMPTY_HTML, html } from '../html';
import type { SafeHtml } from '../html';
import { colourOfPerson } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { formatWholeNumber } from '../text-formatting';
import {
  DEFAULT_PEOPLE_SHOWN,
  formatReplyDelay,
  renderPeopleShownNote,
  selectFeaturedPeople,
  typicalReplyDelayOf,
} from './featured-people';
import type { PeopleShown } from './featured-people';
import { renderSectionHeading } from './section-heading';

/** Shown under the reply times of an export that only records minutes. */
export const MINUTE_RESOLUTION_NOTE: SafeHtml = html`<p class="hint">This export records times to the minute, so replies are rounded.</p>`;

/** Shown instead of the chart when nobody has replied often enough to measure. */
const NOT_ENOUGH_REPLIES_NOTE: SafeHtml = html`<p class="hint">Not enough back and forth to measure.</p>`;

/**
 * Builds one bar per person who has replied often enough, in order of activity.
 */
function buildReplyDelayBars(
  analysis: ChatAnalysis,
  featuredPeople: readonly PersonStatistics[],
  personColours: PersonColours,
): HorizontalBarRow[] {
  const bars: HorizontalBarRow[] = [];
  for (const person of featuredPeople) {
    const typicalDelay = typicalReplyDelayOf(person);
    if (typicalDelay === null) {
      continue;
    }
    bars.push({
      label: person.name,
      value: typicalDelay,
      colour: colourOfPerson(personColours, person.name),
      displayValue: formatReplyDelay(typicalDelay, analysis.timestampResolution),
    });
  }
  return bars;
}

/**
 * Draws the reply-time chart, or a note when there is nothing to chart.
 */
function renderReplyDelays(
  analysis: ChatAnalysis,
  featuredPeople: readonly PersonStatistics[],
  personColours: PersonColours,
): SafeHtml {
  const bars = buildReplyDelayBars(analysis, featuredPeople, personColours);
  if (bars.length === 0) {
    return NOT_ENOUGH_REPLIES_NOTE;
  }

  const chartHtml = renderHorizontalBars(bars);
  if (analysis.timestampResolution === 'minute') {
    return html`${chartHtml}${MINUTE_RESOLUTION_NOTE}`;
  }
  return chartHtml;
}

/**
 * Draws the chart of conversations started by each person.
 */
function renderConversationStarts(
  featuredPeople: readonly PersonStatistics[],
  personColours: PersonColours,
): SafeHtml {
  const bars = featuredPeople.map((person: PersonStatistics): HorizontalBarRow => ({
    label: person.name,
    value: person.conversationsStartedCount,
    colour: colourOfPerson(personColours, person.name),
    displayValue: formatWholeNumber(person.conversationsStartedCount),
  }));
  return renderHorizontalBars(bars);
}

/**
 * Draws the "Replies and openings" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @param peopleShown - Whether to list the most active people only, or everyone.
 * @returns A `<section>` element as markup, or empty markup for a chat with a
 *   single sender, where nobody replies to anybody.
 */
export function renderRepliesSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
): SafeHtml {
  const hasSeveralPeople = analysis.people.length > 1;
  if (!hasSeveralPeople) {
    return EMPTY_HTML;
  }

  const featuredPeople = selectFeaturedPeople(analysis.people, peopleShown);
  const replyDelaysHtml = renderReplyDelays(analysis, featuredPeople, personColours);
  const conversationStartsHtml = renderConversationStarts(featuredPeople, personColours);

  const headingHtml = renderSectionHeading('Replies and openings');
  const replyColumnHtml = html`<div><h3>Typical time to reply</h3>${replyDelaysHtml}</div>`;
  const startsColumnHtml = html`<div><h3>Conversations started</h3>${conversationStartsHtml}</div>`;
  const noteHtml = renderPeopleShownNote(featuredPeople.length, analysis.people.length);
  return html`<section>${headingHtml}<div class="two-columns">${replyColumnHtml}${startsColumnHtml}</div>${noteHtml}</section>`;
}
