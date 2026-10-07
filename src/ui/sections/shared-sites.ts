/**
 * The "Most shared sites" section: the ten sites the links of the chat lead
 * to most often, and for each person listed the site they link to most. Only
 * the name of the site is ever shown; the analysis keeps nothing else of a
 * link. The section is left out of a chat with only a handful of links.
 */

import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { renderHorizontalBars } from '../charts/horizontal-bars';
import type { HorizontalBarRow } from '../charts/horizontal-bars';
import { escapeHtml, EMPTY_HTML, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import { selectMostFrequent, sumOf } from '../ranking';
import type { CountedEntry } from '../ranking';
import { formatCountWithNoun, formatPercentage, formatWholeNumber } from '../text-formatting';
import {
  DEFAULT_PEOPLE_SHOWN,
  renderPeopleShownNote,
  selectFeaturedPeople,
} from './featured-people';
import type { PeopleShown } from './featured-people';
import { renderSectionHeading } from './section-heading';

/** How many sites the chart shows; ten fit on a screen and the rest is a long tail of single links. */
export const MOST_SHARED_SITES_LIMIT = 10;

/**
 * The chat needs at least this many links to a site before the section is
 * shown. With fewer, the "ranking" is a list of links somebody happened to
 * paste once, and close to showing the links themselves.
 */
export const MINIMUM_LINKS_FOR_SHARED_SITES = 10;

/** The table of each person's top site needs somebody to compare with. */
const FEWEST_PEOPLE_TO_COMPARE = 2;

/** The colour of the site bars, which belong to nobody in particular. */
const SITE_BAR_COLOUR = 'var(--neutral-bar)';

/** What a cell shows for a person who shared no link to a site. */
const NO_VALUE = '–';

/** The column headings of the table of people, left to right. */
const TABLE_COLUMN_HEADINGS: readonly string[] = [
  'Person',
  'Top site',
  'Links to it',
  'Links to any site',
];

/**
 * Counts the links of a table of sites.
 *
 * @param linkSiteCounts - How often each site was linked to.
 * @returns The number of links that lead to a site.
 */
export function countLinksToSites(linkSiteCounts: ReadonlyMap<string, number>): number {
  return sumOf(linkSiteCounts.values());
}

/**
 * Tells whether the chat holds enough links for a ranking of sites.
 *
 * @param analysis - The analysed chat.
 * @returns `true` from {@link MINIMUM_LINKS_FOR_SHARED_SITES} links to a site on.
 */
export function hasSharedSitesWorthShowing(analysis: ChatAnalysis): boolean {
  return countLinksToSites(analysis.linkSiteCounts) >= MINIMUM_LINKS_FOR_SHARED_SITES;
}

/**
 * Finds the site a person links to most. Of two sites linked to equally
 * often, the one they shared first wins.
 *
 * @param person - The person's statistics.
 * @returns The site with its count, or `null` for somebody who shared no link to a site.
 */
export function findTopSite(person: PersonStatistics): CountedEntry<string> | null {
  const [topSite] = selectMostFrequent(person.linkSiteCounts, 1);
  return topSite ?? null;
}

/**
 * Draws the chart of the most shared sites of the whole chat: a bar per site
 * with its number of links and its share of all links to a site.
 */
function renderMostSharedSites(linkSiteCounts: ReadonlyMap<string, number>): SafeHtml {
  const linkCount = countLinksToSites(linkSiteCounts);
  const bars = selectMostFrequent(linkSiteCounts, MOST_SHARED_SITES_LIMIT).map(
    (entry: CountedEntry<string>): HorizontalBarRow => ({
      label: entry.key,
      value: entry.count,
      colour: SITE_BAR_COLOUR,
      /* Two spaces: the stylesheet preserves them to set the share apart from the count. */
      displayValue: `${formatWholeNumber(entry.count)}  ${formatPercentage(entry.count / linkCount)}`,
    }),
  );
  return renderHorizontalBars(bars);
}

/**
 * Draws the table row of one person: name, top site, links to it, and all
 * their links to a site.
 */
function renderPersonRow(person: PersonStatistics, personColours: PersonColours): SafeHtml {
  const topSite = findTopSite(person);
  const cells: readonly SafeHtml[] = [
    renderSwatchAndName(personColours, person.name),
    escapeHtml(topSite === null ? NO_VALUE : topSite.key),
    escapeHtml(topSite === null ? NO_VALUE : formatWholeNumber(topSite.count)),
    escapeHtml(formatWholeNumber(countLinksToSites(person.linkSiteCounts))),
  ];
  const cellsHtml = joinHtml(cells.map((cell: SafeHtml): SafeHtml => html`<td>${cell}</td>`));
  return html`<tr>${cellsHtml}</tr>`;
}

/**
 * Draws the table of each listed person's top site, with the note about who
 * is listed. Empty for a chat with a single sender, whose top site is the
 * first bar of the chart.
 */
function renderTopSitesOfPeople(
  analysis: ChatAnalysis,
  personColours: PersonColours,
  peopleShown: PeopleShown,
): SafeHtml {
  if (analysis.people.length < FEWEST_PEOPLE_TO_COMPARE) {
    return EMPTY_HTML;
  }

  const featuredPeople = selectFeaturedPeople(analysis.people, peopleShown);
  const headingsHtml = joinHtml(
    TABLE_COLUMN_HEADINGS.map((heading: string): SafeHtml => html`<th>${escapeHtml(heading)}</th>`),
  );
  const rowsHtml = joinHtml(
    featuredPeople.map((person: PersonStatistics): SafeHtml =>
      renderPersonRow(person, personColours),
    ),
  );
  const tableHtml = html`<table><thead><tr>${headingsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  const noteHtml = renderPeopleShownNote(featuredPeople.length, analysis.people.length);
  return html`<h3 class="top-sites-heading">Each person’s top site</h3><div class="table-wrapper">${tableHtml}</div>${noteHtml}`;
}

/**
 * Draws the "Most shared sites" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @param peopleShown - Whether to list the most active people only, or everyone.
 * @returns A `<section>` element as markup, or empty markup for a chat with
 *   fewer than ten links to a site.
 */
export function renderSharedSitesSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
): SafeHtml {
  if (!hasSharedSitesWorthShowing(analysis)) {
    return EMPTY_HTML;
  }

  const links = formatCountWithNoun(countLinksToSites(analysis.linkSiteCounts), 'link', 'links');
  const sites = formatCountWithNoun(analysis.linkSiteCounts.size, 'site', 'sites');
  const headingHtml = renderSectionHeading(
    'Most shared sites',
    'Where the links in the chat lead. Only the name of the site is read, never the rest of a link.',
  );
  const barsHtml = renderMostSharedSites(analysis.linkSiteCounts);
  const explanation = `${links} to ${sites}. "www." and "m." are taken off and other subdomains are folded into their site; links to a bare address are left out.`;
  const explanationHtml = html`<p class="hint">${escapeHtml(explanation)}</p>`;
  const peopleHtml = renderTopSitesOfPeople(analysis, personColours, peopleShown);
  return html`<section>${headingHtml}${barsHtml}${explanationHtml}${peopleHtml}</section>`;
}
