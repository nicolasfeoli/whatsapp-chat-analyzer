/**
 * The heading every section of the report starts with: a title and, for most
 * sections, a sentence that says how to read what follows.
 */

import { escapeHtml, html } from '../html';
import type { SafeHtml } from '../html';

/**
 * Draws the heading of a section.
 *
 * @param title - The name of the section, e.g. `"Who says what"`.
 * @param caption - A sentence shown under the title; left out when not given.
 * @returns A `<div class="section-heading">` element as markup.
 */
export function renderSectionHeading(title: string, caption?: string): SafeHtml {
  const titleHtml = html`<h2>${escapeHtml(title)}</h2>`;
  if (caption === undefined) {
    return html`<div class="section-heading">${titleHtml}</div>`;
  }
  return html`<div class="section-heading">${titleHtml}<p>${escapeHtml(caption)}</p></div>`;
}
