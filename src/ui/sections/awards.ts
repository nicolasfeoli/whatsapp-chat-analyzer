/**
 * The "Awards" section: a title for whoever leads each of a dozen counts, with
 * the number that earned it. The rules are in `../awards.ts`; this module only
 * draws what they give out. It is left out of a chat with a single sender and
 * when nobody qualifies for anything.
 */

import type { ChatAnalysis } from '../../core/index';
import { collectAwards } from '../awards';
import type { Award } from '../awards';
import { EMPTY_HTML, escapeHtml, html, joinHtml } from '../html';
import type { SafeHtml } from '../html';
import { renderSwatchAndName } from '../person-colours';
import type { PersonColours } from '../person-colours';
import {
  DEFAULT_PEOPLE_SHOWN,
  renderPeopleShownNote,
  selectFeaturedPeople,
} from './featured-people';
import type { PeopleShown } from './featured-people';
import { renderSectionHeading } from './section-heading';

/**
 * Says how the titles are given, so that nobody reads more into one than the
 * count behind it.
 */
const AWARDS_HINT: SafeHtml = html`<p class="hint">Each title goes to the one person who leads that count, and only when there is enough to go on. Of two people level with each other, the one who wrote more messages takes it.</p>`;

/**
 * Draws one award: the title, the winner with their colour, and the number.
 */
function renderAward(award: Award, personColours: PersonColours): SafeHtml {
  const titleHtml = escapeHtml(award.title);
  const winnerHtml = renderSwatchAndName(personColours, award.winner.name);
  const reasonHtml = escapeHtml(award.reason);
  return html`<li><span class="award-title">${titleHtml}</span><span class="award-winner">${winnerHtml}</span><span class="award-reason">${reasonHtml}</span></li>`;
}

/**
 * Draws the "Awards" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @param peopleShown - Whether the most active people compete for the titles, or everyone.
 * @returns A `<section>` element as markup, or empty markup for a chat with a
 *   single sender or one in which nobody qualifies for a title.
 */
export function renderAwardsSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
  peopleShown: PeopleShown = DEFAULT_PEOPLE_SHOWN,
): SafeHtml {
  const hasSeveralPeople = analysis.people.length > 1;
  if (!hasSeveralPeople) {
    return EMPTY_HTML;
  }
  const awards = collectAwards(analysis, peopleShown);
  if (awards.length === 0) {
    return EMPTY_HTML;
  }

  const awardsHtml = joinHtml(
    awards.map((award: Award): SafeHtml => renderAward(award, personColours)),
  );
  const headingHtml = renderSectionHeading(
    'Awards',
    'A title for whoever leads each count, with the number that earned it. All in good fun.',
  );
  const featuredPeople = selectFeaturedPeople(analysis.people, peopleShown);
  const noteHtml = renderPeopleShownNote(featuredPeople.length, analysis.people.length);
  return html`<section>${headingHtml}<ul class="awards">${awardsHtml}</ul>${AWARDS_HINT}${noteHtml}</section>`;
}
