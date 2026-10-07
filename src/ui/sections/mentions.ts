/**
 * The "Who mentions whom" section: a grid with a row for each person and a
 * column for each person they mentioned with `@`. Unlike "Who answers whom"
 * it is not an estimate: a mention names the person it is meant for. It is
 * only shown for a group whose export marks mentions, which iPhone exports do.
 */

import type { ChatAnalysis, PersonStatistics } from '../../core/index';
import { hasAnyCountBetweenPeople, renderPersonGrid } from '../charts/person-grid';
import { EMPTY_HTML, html } from '../html';
import type { SafeHtml } from '../html';
import type { PersonColours } from '../person-colours';
import { selectFeaturedPeople } from './featured-people';
import { SMALLEST_GROUP_SIZE } from './reply-pairs';
import { renderSectionHeading } from './section-heading';

/**
 * The tilde and the white space WhatsApp puts in front of the name of somebody
 * who is not in the exporter's contacts (`~ Carla`). A mention and a sender
 * line do not always write it the same way, so it is ignored when comparing.
 */
const NOT_A_CONTACT_PREFIX_PATTERN = /^~\s*/u;

/**
 * Brings a name to the form in which a mention and a sender are compared:
 * without the "not a contact" tilde and without white space around it.
 *
 * @param name - A sender's name or a mentioned name, as the export wrote it.
 * @returns The name to compare by.
 */
export function normaliseMentionedName(name: string): string {
  return name.trim().replace(NOT_A_CONTACT_PREFIX_PATTERN, '').trim();
}

/**
 * How many times one person mentioned another.
 *
 * @param mentioner - The person who wrote the mentions.
 * @param mentionedPerson - The person looked for among the names they mentioned.
 * @returns The number of mentions; zero when there were none.
 */
export function mentionCountBetween(
  mentioner: PersonStatistics,
  mentionedPerson: PersonStatistics,
): number {
  const wantedName = normaliseMentionedName(mentionedPerson.name);
  let mentionCount = 0;
  for (const [mentionedName, count] of mentioner.mentionCountsByName) {
    if (normaliseMentionedName(mentionedName) === wantedName) {
      mentionCount += count;
    }
  }
  return mentionCount;
}

/**
 * Draws the "Who mentions whom" section.
 *
 * @param analysis - The analysed chat.
 * @param personColours - The colour assignment shared by all charts.
 * @returns A `<section>` element as markup, or empty markup for a chat with
 *   fewer than three senders or in which nobody shown mentioned anybody shown.
 */
export function renderMentionsSection(
  analysis: ChatAnalysis,
  personColours: PersonColours,
): SafeHtml {
  const featuredPeople = selectFeaturedPeople(analysis.people);
  const isGroup = featuredPeople.length >= SMALLEST_GROUP_SIZE;
  if (!isGroup || !hasAnyCountBetweenPeople(featuredPeople, mentionCountBetween)) {
    return EMPTY_HTML;
  }

  const headingHtml = renderSectionHeading(
    'Who mentions whom',
    'Each row is a person, each column is who they called by name with @.',
  );
  const gridHtml = renderPersonGrid(featuredPeople, mentionCountBetween, personColours);
  return html`<section>${headingHtml}${gridHtml}</section>`;
}
