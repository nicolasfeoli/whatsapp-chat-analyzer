/**
 * The top of the report: the chat's title, period and colour legend, followed
 * by the six headline numbers.
 */

import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import {
  OTHER_PEOPLE_COLOUR,
  renderColourSwatch,
  renderSwatchAndName,
  selectColouredPeople,
} from '../person-colours';
import type { PersonColours } from '../person-colours';
import { sumOf } from '../ranking';
import { formatCountWithNoun, formatLongDate, formatWholeNumber } from '../text-formatting';

/**
 * Draws the legend: one entry per coloured person, and a last entry counting
 * everybody else when there are more people than colours.
 */
function renderLegend(people: readonly PersonStatistics[], personColours: PersonColours): SafeHtml {
  const colouredPeople = selectColouredPeople(people);
  const legendEntries: SafeHtml[] = colouredPeople.map(
    (person: PersonStatistics): SafeHtml =>
      html`<span>${renderSwatchAndName(personColours, person.name)}</span>`,
  );

  const otherPeopleCount = people.length - colouredPeople.length;
  if (otherPeopleCount > 0) {
    const othersSwatch = renderColourSwatch(OTHER_PEOPLE_COLOUR);
    legendEntries.push(html`<span>${othersSwatch}${otherPeopleCount} others</span>`);
  }
  return html`<div class="legend">${joinHtml(legendEntries)}</div>`;
}

/**
 * Draws the heading of the report.
 *
 * @param analysis - The analysed chat.
 * @param title - The name of the chat, usually taken from the file name; untrusted.
 * @param personColours - The colour assignment shared by all charts.
 * @returns A `<div class="chat-heading">` element as markup.
 */
export function renderChatHeading(
  analysis: ChatAnalysis,
  title: string,
  personColours: PersonColours,
): SafeHtml {
  const firstDay = formatLongDate(analysis.firstMessageTimestamp);
  const lastDay = formatLongDate(analysis.lastMessageTimestamp);
  const span = formatCountWithNoun(analysis.spanInDays, 'day', 'days');
  const period = `${firstDay} to ${lastDay} · ${span}`;

  const titleHtml = html`<h2>${escapeHtml(title)}</h2>`;
  const periodHtml = html`<div class="chat-period monospace">${escapeHtml(period)}</div>`;
  const legendHtml = renderLegend(analysis.people, personColours);
  return html`<div class="chat-heading">${titleHtml}${periodHtml}${legendHtml}</div>`;
}

/**
 * Draws one headline number with its caption.
 *
 * @param formattedValue - The number as it should be shown, e.g. `"12,345"`.
 * @param caption - What the number counts.
 */
function renderStatistic(formattedValue: string, caption: string): SafeHtml {
  return html`<div class="headline-statistic"><b>${escapeHtml(formattedValue)}</b><span>${escapeHtml(caption)}</span></div>`;
}

/**
 * Draws the six headline numbers.
 *
 * @param analysis - The analysed chat.
 * @returns A `<div class="headline-statistics">` element as markup.
 */
export function renderHeadlineStatistics(analysis: ChatAnalysis): SafeHtml {
  const totalWordCount = sumOf(
    analysis.people.map((person: PersonStatistics): number => person.wordCount),
  );
  const totalMediaCount = sumOf(
    analysis.people.map((person: PersonStatistics): number => person.mediaCount),
  );
  const messagesPerActiveDay = analysis.totalMessageCount / analysis.activeDayCount;
  const spanCaption = `active days of ${formatWholeNumber(analysis.spanInDays)}`;

  const statistics: readonly SafeHtml[] = [
    renderStatistic(formatWholeNumber(analysis.totalMessageCount), 'messages'),
    renderStatistic(formatWholeNumber(totalWordCount), 'words'),
    renderStatistic(formatWholeNumber(analysis.activeDayCount), spanCaption),
    renderStatistic(messagesPerActiveDay.toFixed(1), 'messages per active day'),
    renderStatistic(formatWholeNumber(analysis.conversationCount), 'conversations'),
    renderStatistic(formatWholeNumber(totalMediaCount), 'photos, audios and files'),
  ];
  return html`<div class="headline-statistics">${joinHtml(statistics)}</div>`;
}

/**
 * Draws the heading and the headline numbers together.
 *
 * @param analysis - The analysed chat.
 * @param title - The name of the chat; untrusted.
 * @param personColours - The colour assignment shared by all charts.
 * @returns The summary as markup.
 */
export function renderSummarySection(
  analysis: ChatAnalysis,
  title: string,
  personColours: PersonColours,
): SafeHtml {
  const headingHtml = renderChatHeading(analysis, title, personColours);
  const statisticsHtml = renderHeadlineStatistics(analysis);
  return html`${headingHtml}${statisticsHtml}`;
}
