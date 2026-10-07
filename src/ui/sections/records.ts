/**
 * The "From the record" section: the first message of the export and the
 * longest message, each drawn as a chat bubble.
 */

import type { ChatAnalysis, ChatMessage } from '../../core/index';
import { escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { formatBubbleTimestamp, formatWholeNumber } from '../text-formatting';
import { renderSectionHeading } from './section-heading';

/**
 * A bubble shows at most this many characters of a message. A pasted article
 * would otherwise push the rest of the page out of sight.
 */
const LONGEST_BUBBLE_TEXT_IN_CHARACTERS = 1500;

/** Appended to a message that was cut short. */
const TRUNCATION_MARK = ' …';

/**
 * Shown instead of the export's own placeholder for media, which comes in many
 * languages ("image omitted", "<Multimedia omitido>" ...).
 */
const MEDIA_PLACEHOLDER = '(photo, audio or file)';

/**
 * Chooses the text a bubble shows for a message.
 *
 * @param message - The message to show.
 * @returns A fixed placeholder for media, otherwise the message text, cut
 *   after 1,500 characters. Not escaped.
 */
export function describeMessageForBubble(message: ChatMessage): string {
  if (message.kind === 'media') {
    return MEDIA_PLACEHOLDER;
  }
  if (message.text.length > LONGEST_BUBBLE_TEXT_IN_CHARACTERS) {
    return message.text.slice(0, LONGEST_BUBBLE_TEXT_IN_CHARACTERS) + TRUNCATION_MARK;
  }
  return message.text;
}

/**
 * Draws one message as a chat bubble under a caption.
 *
 * @param message - The message to show.
 * @param caption - The heading above the bubble.
 * @param personColours - The colour assignment shared by all charts.
 * @returns The captioned bubble as markup. The sender, the text and the
 *   caption are all escaped here.
 */
export function renderMessageBubble(
  message: ChatMessage,
  caption: string,
  personColours: PersonColours,
): SafeHtml {
  const senderHtml = renderSwatchAndName(personColours, message.sender);
  const textHtml = escapeHtml(describeMessageForBubble(message));
  const timestampHtml = escapeHtml(formatBubbleTimestamp(message.timestamp));

  const bubbleHtml = html`<div class="bubble"><div class="person-name">${senderHtml}</div><div class="bubble-text">${textHtml}</div><div class="bubble-timestamp">${timestampHtml}</div></div>`;
  return html`<div><h3 style="margin-bottom:8px">${escapeHtml(caption)}</h3>${bubbleHtml}</div>`;
}

/**
 * Draws the "From the record" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @returns A `<section>` element as markup.
 */
export function renderRecordsSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  const bubbles: SafeHtml[] = [];

  const firstMessage = analysis.messages[0];
  if (firstMessage !== undefined) {
    bubbles.push(renderMessageBubble(firstMessage, 'First message in the export', personColours));
  }

  if (analysis.longestMessage !== null) {
    const caption = `Longest message, ${formatWholeNumber(analysis.longestMessageWordCount)} words`;
    bubbles.push(renderMessageBubble(analysis.longestMessage, caption, personColours));
  }

  const headingHtml = renderSectionHeading('From the record');
  return html`<section>${headingHtml}<div class="two-columns">${joinHtml(bubbles)}</div></section>`;
}
