/**
 * Draws the cards of the recap: plain card data in, escaped markup out.
 * Every text of a card passes through `escapeHtml` here, names included.
 */

import { escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import type { RecapCard } from './cards';

/**
 * Draws one card: its label, its headline and its supporting lines.
 *
 * @param card - The card; every text in it is untrusted.
 * @returns The content of the card as markup, without the element around it.
 */
export function renderRecapCard(card: RecapCard): SafeHtml {
  const linesHtml = joinHtml(
    card.lines.map((line: string): SafeHtml => html`<li>${escapeHtml(line)}</li>`),
  );
  const labelHtml = html`<p class="recap-card-label">${escapeHtml(card.label)}</p>`;
  const headlineHtml = html`<h3 class="recap-card-headline">${escapeHtml(card.headline)}</h3>`;
  return html`<div class="recap-card-content" data-recap-card="${escapeHtml(card.kind)}">${labelHtml}${headlineHtml}<ul class="recap-card-lines">${linesHtml}</ul></div>`;
}

/**
 * Says which card is on display.
 *
 * @param cardIndex - The position of the card, counting from 0.
 * @param cardCount - How many cards the recap has.
 * @returns For example `"Card 3 of 8"`.
 */
export function describeRecapPosition(cardIndex: number, cardCount: number): string {
  return `Card ${String(cardIndex + 1)} of ${String(cardCount)}`;
}

/**
 * The title of the recap of a year. It names no chat and no person, so it
 * reads the same for a group and for a chat of two, and with names hidden.
 *
 * @param year - The year the recap is about.
 * @returns For example `"2025 in this chat"`.
 */
export function describeRecapTitle(year: number): string {
  return `${String(year)} in this chat`;
}

/**
 * The words on the button that opens the recap of a year.
 *
 * @param year - The year the button would open.
 * @returns For example `"See 2025 in this chat"`.
 */
export function describeOpenRecapButton(year: number): string {
  return `See ${describeRecapTitle(year)}`;
}
