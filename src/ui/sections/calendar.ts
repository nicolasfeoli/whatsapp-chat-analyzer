/**
 * The "Day by day" section: the calendar of the chat, a block per year with a
 * square per day, and the legend that says what the weakest and the strongest
 * tint stand for. It is left out of a chat shorter than a month.
 */

import type { ChatAnalysis } from '../../core/index';
import { buildChatCalendar, renderCalendar } from '../charts/calendar';
import type { ChatCalendar } from '../charts/calendar';
import { EMPTY_HTML, escapeHtml, html } from '../html';
import type { SafeHtml } from '../html';
import { formatWholeNumber } from '../text-formatting';
import { renderSectionHeading } from './section-heading';

/**
 * A chat needs to span this many days before its calendar is drawn. Below a
 * month the block of a year would hold a handful of squares, which the
 * timeline already shows better.
 */
export const SHORTEST_SPAN_FOR_CALENDAR_IN_DAYS = 31;

/**
 * Writes the note that older years are not drawn.
 *
 * @param calendar - The years laid out.
 * @returns A `<p class="hint calendar-years-note">` element as markup, or
 *   empty markup when every year of the chat is drawn.
 */
export function renderOlderYearsNote(calendar: ChatCalendar): SafeHtml {
  const shownYearCount = calendar.years.length;
  if (shownYearCount >= calendar.yearCountOfChat) {
    return EMPTY_HTML;
  }
  const note = `Showing the latest ${String(shownYearCount)} of ${String(calendar.yearCountOfChat)} years. Choose an older year under “Period” to see its calendar.`;
  return html`<p class="hint calendar-years-note">${escapeHtml(note)}</p>`;
}

/**
 * Draws the "Day by day" section.
 *
 * @param analysis - The analysed chat.
 * @returns A `<section>` element as markup, or empty markup for a chat that
 *   spans less than a month.
 */
export function renderCalendarSection(analysis: ChatAnalysis): SafeHtml {
  if (analysis.spanInDays < SHORTEST_SPAN_FOR_CALENDAR_IN_DAYS) {
    return EMPTY_HTML;
  }

  const calendar = buildChatCalendar(analysis);
  const busiestDayCount = escapeHtml(formatWholeNumber(calendar.busiestDayMessageCount));

  const headingHtml = renderSectionHeading(
    'Day by day',
    'Each square is one day and each column one week, Monday on top. A stronger tint means more messages; quiet days are tinted more than their share, so that they still show next to the busiest one.',
  );
  const legendHtml = html`<div class="heatmap-legend">1<i></i>${busiestDayCount} messages in a day</div>`;
  const noteHtml = renderOlderYearsNote(calendar);
  return html`<section>${headingHtml}${renderCalendar(calendar)}${legendHtml}${noteHtml}</section>`;
}
