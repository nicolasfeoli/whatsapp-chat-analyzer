/**
 * The "Who answers whom" section: a grid with a row for each person and a
 * column for each person they answered, holding the number of replies. It is
 * only shown for a group, because in a chat of two each person can only answer
 * the other.
 */

import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { hasAnyCountBetweenPeople, renderPersonGrid } from '../charts/person-grid';
import { EMPTY_HTML, html } from '../html';
import type { SafeHtml } from '../html';
import type { PersonColours } from '../person-colours';
import { selectFeaturedPeople } from './featured-people';
import { renderSectionHeading } from './section-heading';

/** The grid needs at least this many people; with two, each can only answer the other. */
export const SMALLEST_GROUP_SIZE = 3;

/**
 * How many times one person replied to another.
 *
 * @param replier - The person who wrote the reply.
 * @param recipientName - The name of the person whose message was answered.
 * @returns The number of replies; zero when there were none.
 */
export function replyCountBetween(replier: PersonStatistics, recipientName: string): number {
  return replier.replyCountsByRecipient.get(recipientName) ?? 0;
}

/**
 * The count of one cell of the grid: the replies of the row's person to the column's.
 */
function countRepliesBetween(replier: PersonStatistics, recipient: PersonStatistics): number {
  return replyCountBetween(replier, recipient.name);
}

/**
 * Draws the "Who answers whom" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @returns A `<section>` element as markup, or empty markup for a chat with
 *   fewer than three senders or without a single reply.
 */
export function renderReplyPairsSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  const featuredPeople = selectFeaturedPeople(analysis.people);
  const isGroup = featuredPeople.length >= SMALLEST_GROUP_SIZE;
  if (!isGroup || !hasAnyCountBetweenPeople(featuredPeople, countRepliesBetween)) {
    return EMPTY_HTML;
  }

  const headingHtml = renderSectionHeading(
    'Who answers whom',
    'Each row is a person, each column is whose message they answered. The export does not say which message a reply quotes, so a reply counts towards whoever wrote just before it.',
  );
  const gridHtml = renderPersonGrid(featuredPeople, countRepliesBetween, personColours);
  return html`<section>${headingHtml}${gridHtml}</section>`;
}
