/**
 * The "Then and now" section: each person's share of the messages in the first
 * stretch of the chat next to their share in the latest one, to show who faded
 * and who took over. It is only shown for a chat with more than one sender
 * that is long enough to compare.
 */

import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { escapeHtml, EMPTY_HTML, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { sumOf } from '../ranking';
import { formatCountWithNoun, formatPercentage } from '../text-formatting';
import { selectFeaturedPeople } from './featured-people';
import { renderSectionHeading } from './section-heading';

/** A comparison period of this many days is called a year. */
const DAYS_PER_YEAR = 365;

/** Shares are compared in percentage points: the difference between 34% and 12% is 22 points. */
const PERCENTAGE_POINTS_PER_WHOLE = 100;

/** A change smaller than half a point rounds to zero and is shown as no change. */
const SMALLEST_SHOWN_CHANGE_IN_POINTS = 0.5;

/** The minus sign (U+2212), which is as wide as a plus sign and lines up with it in a column. */
const MINUS_SIGN = '−';

/**
 * Names the two periods for the column headings.
 *
 * @param periodInDays - The length of each comparison period.
 * @returns For example `{ early: 'First year', recent: 'Latest year' }` or
 *   `{ early: 'First 90 days', recent: 'Latest 90 days' }`.
 */
export function describeComparisonPeriods(periodInDays: number): {
  readonly early: string;
  readonly recent: string;
} {
  if (periodInDays === DAYS_PER_YEAR) {
    return { early: 'First year', recent: 'Latest year' };
  }
  const length = formatCountWithNoun(periodInDays, 'day', 'days');
  return { early: `First ${length}`, recent: `Latest ${length}` };
}

/**
 * Writes the change between two shares in percentage points.
 *
 * @param earlyShare - The share in the first period, between 0 and 1.
 * @param recentShare - The share in the last period, between 0 and 1.
 * @returns For example `"+22 pts"`, `"−5 pts"` or `"no change"`.
 */
export function formatShareChange(earlyShare: number, recentShare: number): string {
  const changeInPoints = (recentShare - earlyShare) * PERCENTAGE_POINTS_PER_WHOLE;
  if (Math.abs(changeInPoints) < SMALLEST_SHOWN_CHANGE_IN_POINTS) {
    return 'no change';
  }
  const sign = changeInPoints > 0 ? '+' : MINUS_SIGN;
  return `${sign}${Math.abs(changeInPoints).toFixed(0)} pts`;
}

/**
 * Divides a person's count by the total of a period; zero for an empty period.
 */
function shareOf(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

/**
 * Draws the table row of one person: name, early share, recent share, change.
 */
function renderPersonRow(
  person: PersonStatistics,
  earlyTotal: number,
  recentTotal: number,
  personColours: PersonColours,
): SafeHtml {
  const earlyShare = shareOf(person.earlyMessageCount, earlyTotal);
  const recentShare = shareOf(person.recentMessageCount, recentTotal);
  const cells: readonly SafeHtml[] = [
    renderSwatchAndName(personColours, person.name),
    escapeHtml(formatPercentage(earlyShare)),
    escapeHtml(formatPercentage(recentShare)),
    escapeHtml(formatShareChange(earlyShare, recentShare)),
  ];
  const cellsHtml = joinHtml(cells.map((cell: SafeHtml): SafeHtml => html`<td>${cell}</td>`));
  return html`<tr>${cellsHtml}</tr>`;
}

/**
 * Draws the "Then and now" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @returns A `<section>` element as markup, or empty markup for a chat with a
 *   single sender or one too short to compare.
 */
export function renderThenAndNowSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  const hasSeveralPeople = analysis.people.length > 1;
  const isLongEnough = analysis.comparisonPeriodInDays > 0;
  if (!hasSeveralPeople || !isLongEnough) {
    return EMPTY_HTML;
  }

  /* The totals cover everybody, so the shares of the people shown are shares of the whole chat. */
  const earlyTotal = sumOf(analysis.people.map((person) => person.earlyMessageCount));
  const recentTotal = sumOf(analysis.people.map((person) => person.recentMessageCount));

  const periodNames = describeComparisonPeriods(analysis.comparisonPeriodInDays);
  const headings: readonly string[] = ['Person', periodNames.early, periodNames.recent, 'Change'];
  const headingsHtml = joinHtml(
    headings.map((heading: string): SafeHtml => html`<th>${escapeHtml(heading)}</th>`),
  );
  const rowsHtml = joinHtml(
    selectFeaturedPeople(analysis.people).map((person: PersonStatistics): SafeHtml =>
      renderPersonRow(person, earlyTotal, recentTotal, personColours),
    ),
  );

  const headingHtml = renderSectionHeading(
    'Then and now',
    'Each person’s share of the messages when the chat began and in its latest stretch.',
  );
  const tableHtml = html`<table><thead><tr>${headingsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  return html`<section>${headingHtml}<div class="table-wrapper">${tableHtml}</div></section>`;
}
