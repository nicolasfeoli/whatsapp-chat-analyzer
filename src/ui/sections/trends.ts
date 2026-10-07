/**
 * The "How things changed" section: small charts of how the habits of the
 * chat moved over time, each with a sentence that reads it, and a strip per
 * word and per emoji for the five most used of each.
 *
 * What the lines are and what the sentences say is worked out in
 * `../trends.ts`; the charts are drawn by `../charts/trend-chart.ts`. This
 * module puts them together and says how to read them. The section is left
 * out of a chat that spans fewer than six buckets, and of one so thin that
 * no chart has a line to draw.
 */

import type { ChatAnalysis, TermTrend, TrendGranularity } from '../../core/index';
import { renderBarStrip } from '../charts/bar-strip';
import type { BarStripBar } from '../charts/bar-strip';
import { renderTrendChart } from '../charts/trend-chart';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { COLOURED_PEOPLE_LIMIT } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { MINIMUM_REPLIES_FOR_TYPICAL_DELAY } from './featured-people';
import {
  MINIMUM_MESSAGES_FOR_TREND_POINT,
  buildTrendCharts,
  formatTrendBucketLabel,
} from '../trends';
import type { TrendChartData } from '../trends';
import { renderSectionHeading } from './section-heading';

/**
 * A chat needs this many buckets before the section is shown: with fewer
 * than six points there is no early and no late end to compare, and a line
 * through four months is the timeline told again.
 */
export const MINIMUM_TREND_BUCKETS = 6;

/** How many words, and how many emojis, get a strip over time. */
export const TERM_TRENDS_SHOWN = 5;

/** The colour of the bars of a word or an emoji over time. */
const TERM_TREND_COLOUR = 'var(--neutral-bar)';

/**
 * Writes the note that the lines per person stop at six people, for a chat
 * with more. It applies whether or not "Show everyone" is ticked: a chart
 * with more lines than colours could not be read.
 *
 * @param peopleCount - How many people wrote in the chat.
 * @returns A `<p class="hint people-shown-note">` element as markup, or empty
 *   markup when everybody has a line.
 */
export function renderTrendPeopleNote(peopleCount: number): SafeHtml {
  if (peopleCount <= COLOURED_PEOPLE_LIMIT) {
    return EMPTY_HTML;
  }
  const others = peopleCount - COLOURED_PEOPLE_LIMIT;
  const note = `The ${String(COLOURED_PEOPLE_LIMIT)} most active of ${String(peopleCount)} people have a line each. The other ${String(others)} are added up as "Others" in the share of the messages and have no line for reply times.`;
  return html`<p class="hint people-shown-note">${escapeHtml(note)}</p>`;
}

/**
 * Draws the strip of one word or emoji: its name, and one bar per bucket for
 * the messages that contain it.
 */
function renderTermTrend(
  termTrend: TermTrend,
  bucketLabels: readonly string[],
  granularity: TrendGranularity,
): SafeHtml {
  const bars = termTrend.messageCountsByBucket.map(
    (messageCount: number, bucketIndex: number): BarStripBar => ({
      axisLabel: '',
      slotName: bucketLabels[bucketIndex] ?? '',
      messageCount,
    }),
  );
  const firstLabel = bucketLabels[0] ?? '';
  const lastLabel = bucketLabels[bucketLabels.length - 1] ?? '';
  const description = `Messages that contain "${termTrend.term}" per ${granularity}, from ${firstLabel} to ${lastLabel}.`;
  const stripHtml = renderBarStrip(bars, TERM_TREND_COLOUR, description);
  return html`<div class="term-trend"><span class="term-trend-name">${escapeHtml(termTrend.term)}</span>${stripHtml}</div>`;
}

/**
 * Draws the strips of the most used words, or of the most used emojis.
 * Empty when there is none to follow.
 */
function renderTermTrends(
  title: string,
  termTrends: readonly TermTrend[],
  bucketLabels: readonly string[],
  granularity: TrendGranularity,
): SafeHtml {
  const shownTrends = termTrends.slice(0, TERM_TRENDS_SHOWN);
  if (shownTrends.length === 0) {
    return EMPTY_HTML;
  }
  const stripsHtml = joinHtml(
    shownTrends.map((termTrend: TermTrend): SafeHtml =>
      renderTermTrend(termTrend, bucketLabels, granularity),
    ),
  );
  return html`<div class="term-trends"><h3>${escapeHtml(title)}</h3>${stripsHtml}</div>`;
}

/**
 * Draws the "How things changed" section.
 *
 * @param analysis - The analysed chat; its copy without names while names are hidden.
 * @param personColours - The colour assignment shared by all charts.
 * @returns A `<section>` element as markup, or empty markup for a chat of
 *   fewer than six buckets and for one in which no chart has a line.
 */
export function renderTrendsSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  const { buckets, granularity, wordTrends, emojiTrends } = analysis.trends;
  const firstBucket = buckets[0];
  const lastBucket = buckets[buckets.length - 1];
  if (
    buckets.length < MINIMUM_TREND_BUCKETS ||
    firstBucket === undefined ||
    lastBucket === undefined
  ) {
    return EMPTY_HTML;
  }

  /* Without a single line there is no change to show, and strips of words alone would be the word lists again. */
  const charts = buildTrendCharts(analysis, personColours);
  if (charts.length === 0) {
    return EMPTY_HTML;
  }
  const bucketLabels = buckets.map((bucket): string =>
    formatTrendBucketLabel(bucket.start, granularity),
  );
  const wordsHtml = renderTermTrends('Most used words', wordTrends, bucketLabels, granularity);
  const emojisHtml = renderTermTrends('Most used emojis', emojiTrends, bucketLabels, granularity);

  const firstLabel = formatTrendBucketLabel(firstBucket.start, granularity);
  const lastLabel = formatTrendBucketLabel(lastBucket.start, granularity);
  const headingHtml = renderSectionHeading(
    'How things changed',
    `The habits of the chat ${granularity} by ${granularity}, from ${firstLabel} to ${lastLabel}. Hover or tap a chart for the numbers.`,
  );
  const chartsHtml = joinHtml(
    charts.map((chart: TrendChartData): SafeHtml => renderTrendChart(chart)),
  );
  const chartsHint = `A ${granularity} has a point when it holds at least ${String(MINIMUM_MESSAGES_FOR_TREND_POINT)} messages, and a person a reply time when they replied at least ${String(MINIMUM_REPLIES_FOR_TYPICAL_DELAY)} times in it. Reply times are drawn on a scale that grows in steps of times ten. The sentence under a chart compares the average over the first 25% of the chart with the average over the last 25%, and is left out when the change is small.`;
  const chartsBlockHtml = html`<div class="trend-charts">${chartsHtml}</div><p class="hint">${escapeHtml(chartsHint)}</p>${renderTrendPeopleNote(analysis.people.length)}`;

  const termsHint = `One bar per ${granularity}, for the messages that contain the word or the emoji. Each strip is scaled to its own tallest bar, and a busy ${granularity} has more of everything.`;
  const termsBlockHtml =
    wordsHtml === EMPTY_HTML && emojisHtml === EMPTY_HTML
      ? EMPTY_HTML
      : html`<div class="two-columns">${wordsHtml}${emojisHtml}</div><p class="hint">${escapeHtml(termsHint)}</p>`;

  return html`<section>${headingHtml}${chartsBlockHtml}${termsBlockHtml}</section>`;
}
