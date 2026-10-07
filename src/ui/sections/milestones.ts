/**
 * The "Milestones" section: the moments the chat passed, oldest first. The
 * first message, each round number of messages it reached, the day half of
 * its messages had been sent, and its latest anniversary.
 *
 * The first message alone is not a list worth a heading (its text is shown
 * under "From the record"), so the section is left out of a chat that has
 * passed nothing else.
 */

import type { ChatAnalysis, ChatMilestone } from '../../core/index';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { formatCountWithNoun, formatLongDate, formatWholeNumber } from '../text-formatting';
import { renderSectionHeading } from './section-heading';

/**
 * Says what happened at a milestone, without its date.
 *
 * @param milestone - The milestone to describe.
 * @param analysis - The analysed chat, for the total the half is measured against.
 * @param personColours - The colour assignment shared by all charts.
 * @returns The sentence as markup; a sender's name is escaped here.
 */
export function describeMilestone(
  milestone: ChatMilestone,
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  switch (milestone.kind) {
    case 'first-message': {
      const senderHtml = renderSwatchAndName(personColours, milestone.sender);
      return html`First message, from <span class="milestone-sender">${senderHtml}</span>`;
    }
    case 'message-count': {
      const ordinal = escapeHtml(`${formatWholeNumber(milestone.messageCount)}th`);
      const senderHtml = renderSwatchAndName(personColours, milestone.sender);
      return html`The ${ordinal} message, from <span class="milestone-sender">${senderHtml}</span>`;
    }
    case 'half-of-messages': {
      const total = escapeHtml(formatWholeNumber(analysis.totalMessageCount));
      return html`Half of the ${total} messages had been sent`;
    }
    case 'anniversary': {
      const length = escapeHtml(formatCountWithNoun(milestone.years, 'year', 'years'));
      return html`${length} since the first message`;
    }
  }
}

/**
 * Tells whether a chat has passed anything besides its first message.
 *
 * @param milestones - The milestones of the chat.
 * @returns `true` when at least one of them is not the first message.
 */
export function hasMilestonesWorthListing(milestones: readonly ChatMilestone[]): boolean {
  return milestones.some((milestone: ChatMilestone): boolean => milestone.kind !== 'first-message');
}

/**
 * Draws the "Milestones" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @returns A `<section>` element as markup, or empty markup for a chat whose
 *   only milestone is its first message.
 */
export function renderMilestonesSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  if (!hasMilestonesWorthListing(analysis.milestones)) {
    return EMPTY_HTML;
  }

  const itemsHtml = joinHtml(
    analysis.milestones.map((milestone: ChatMilestone): SafeHtml => {
      const dateHtml = escapeHtml(formatLongDate(milestone.timestamp));
      const descriptionHtml = describeMilestone(milestone, analysis, personColours);
      return html`<li><span class="milestone-date">${dateHtml}</span><span class="milestone-description">${descriptionHtml}</span></li>`;
    }),
  );

  const headingHtml = renderSectionHeading(
    'Milestones',
    'The moments the chat passed, from its first message on.',
  );
  return html`<section>${headingHtml}<ol class="milestones">${itemsHtml}</ol></section>`;
}
