/**
 * The "Who answers whom" section: a grid with a row for each person and a
 * column for each person they answered, holding the number of replies. It is
 * only shown for a group, because in a chat of two each person can only answer
 * the other.
 */

import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { formatWholeNumber } from '../text-formatting';
import { selectFeaturedPeople } from './featured-people';
import { renderSectionHeading } from './section-heading';

/** The grid needs at least this many people; with two, each can only answer the other. */
const SMALLEST_GROUP_SIZE = 3;

/**
 * A cell with a single reply is already tinted this many percent towards the
 * accent colour, so it is clearly told apart from an empty cell.
 */
const FAINTEST_TINT_PERCENT = 6;

/**
 * The remaining range of the tint, spread linearly up to the person each row
 * answers most. The strongest tint stays well below the full accent colour so
 * the number written on it remains readable in both colour schemes.
 */
const TINT_RANGE_PERCENT = 34;

/** What a cell on the diagonal shows: nobody replies to their own message. */
const OWN_MESSAGE_CELL: SafeHtml = html`<td class="reply-grid-own" aria-hidden="true">&middot;</td>`;

/** The empty cell above the row headings and to the left of the column headings. */
const CORNER_CELL: SafeHtml = html`<td></td>`;

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
 * Finds the highest number of replies a person gave to any one of the people
 * in the grid, which is what the tints of their row are scaled against.
 */
function findLargestReplyCount(
  replier: PersonStatistics,
  featuredPeople: readonly PersonStatistics[],
): number {
  let largestReplyCount = 0;
  for (const recipient of featuredPeople) {
    largestReplyCount = Math.max(largestReplyCount, replyCountBetween(replier, recipient.name));
  }
  return largestReplyCount;
}

/**
 * Writes the `style` attribute that tints a cell, with its leading space. A
 * cell without replies gets no attribute and keeps the background of the page.
 */
function renderTintAttribute(replyCount: number, largestReplyCountInRow: number): SafeHtml {
  if (replyCount <= 0) {
    return EMPTY_HTML;
  }
  const tintPercent =
    FAINTEST_TINT_PERCENT + (TINT_RANGE_PERCENT * replyCount) / largestReplyCountInRow;
  const roundedTintPercent = escapeHtml(tintPercent.toFixed(0));
  return html` style="background:color-mix(in oklab,var(--accent) ${roundedTintPercent}%,transparent)"`;
}

/**
 * Draws the cell where a replier's row meets a recipient's column.
 */
function renderReplyCell(
  replier: PersonStatistics,
  recipient: PersonStatistics,
  largestReplyCountInRow: number,
): SafeHtml {
  if (replier === recipient) {
    return OWN_MESSAGE_CELL;
  }
  const replyCount = replyCountBetween(replier, recipient.name);
  const tintAttribute = renderTintAttribute(replyCount, largestReplyCountInRow);
  return html`<td${tintAttribute}>${escapeHtml(formatWholeNumber(replyCount))}</td>`;
}

/**
 * Draws the row of one replier: their name, then a cell per recipient. The
 * full name is repeated in a `title`, because a long name is cut short.
 */
function renderReplierRow(
  replier: PersonStatistics,
  featuredPeople: readonly PersonStatistics[],
  personColours: PersonColours,
): SafeHtml {
  const largestReplyCountInRow = findLargestReplyCount(replier, featuredPeople);
  const cellsHtml = joinHtml(
    featuredPeople.map((recipient: PersonStatistics): SafeHtml =>
      renderReplyCell(replier, recipient, largestReplyCountInRow),
    ),
  );
  const nameHtml = renderSwatchAndName(personColours, replier.name);
  const title = escapeHtml(replier.name);
  return html`<tr><th scope="row" title="${title}"><span class="reply-grid-name">${nameHtml}</span></th>${cellsHtml}</tr>`;
}

/**
 * Draws the heading of one column: the name of the person who was answered.
 * The full name is repeated in a `title`, because a long name is cut short.
 */
function renderRecipientHeading(recipient: PersonStatistics): SafeHtml {
  const name = escapeHtml(recipient.name);
  return html`<th scope="col" title="${name}"><span class="reply-grid-name">${name}</span></th>`;
}

/**
 * Tells whether any of the featured people replied to another of them, which
 * is what makes the grid worth drawing.
 */
function hasAnyReply(featuredPeople: readonly PersonStatistics[]): boolean {
  return featuredPeople.some(
    (replier: PersonStatistics): boolean => findLargestReplyCount(replier, featuredPeople) > 0,
  );
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
  if (featuredPeople.length < SMALLEST_GROUP_SIZE || !hasAnyReply(featuredPeople)) {
    return EMPTY_HTML;
  }

  const headingHtml = renderSectionHeading(
    'Who answers whom',
    'Each row is a person, each column is whose message they answered. The export does not say which message a reply quotes, so a reply counts towards whoever wrote just before it.',
  );
  const columnHeadingsHtml = joinHtml(featuredPeople.map(renderRecipientHeading));
  const rowsHtml = joinHtml(
    featuredPeople.map((replier: PersonStatistics): SafeHtml =>
      renderReplierRow(replier, featuredPeople, personColours),
    ),
  );
  const tableHtml = html`<table class="reply-grid"><thead><tr>${CORNER_CELL}${columnHeadingsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  return html`<section>${headingHtml}<div class="table-wrapper">${tableHtml}</div></section>`;
}
