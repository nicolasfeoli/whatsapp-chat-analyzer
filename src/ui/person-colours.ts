/**
 * Which colour stands for which person.
 *
 * The stylesheet defines six series colours (`--s1` to `--s6`) and one muted
 * colour (`--other`). The six people with the most messages get a series
 * colour each; everybody else shares the muted one. The same assignment is
 * used by every chart, so a person keeps one colour down the whole page.
 */

import type { PersonStatistics } from '../core/index';
import { escapeHtml, html } from './html';
import type { SafeHtml } from './html';

/**
 * How many people get a colour of their own. The palette in the stylesheet has
 * six series colours that stay distinguishable in light and dark mode; a
 * seventh would start to look like one of the others.
 */
export const COLOURED_PEOPLE_LIMIT = 6;

/** The CSS colour shared by everyone beyond the coloured people. */
export const OTHER_PEOPLE_COLOUR = 'var(--other)';

/** The CSS colour of each person who has one, by name. */
export type PersonColours = ReadonlyMap<string, string>;

/**
 * Picks the people who get a colour of their own.
 *
 * @param people - Everyone in the chat, most messages first.
 * @returns The first six.
 */
export function selectColouredPeople(
  people: readonly PersonStatistics[],
): readonly PersonStatistics[] {
  return people.slice(0, COLOURED_PEOPLE_LIMIT);
}

/**
 * Gives the most active people a series colour each.
 *
 * @param people - Everyone in the chat, most messages first.
 * @returns The colour of each of the first six people.
 */
export function assignPersonColours(people: readonly PersonStatistics[]): PersonColours {
  const personColours = new Map<string, string>();
  for (const [index, person] of selectColouredPeople(people).entries()) {
    const seriesNumber = index + 1;
    personColours.set(person.name, `var(--s${seriesNumber})`);
  }
  return personColours;
}

/**
 * Looks up the colour that stands for a person.
 *
 * @param personColours - The assignment made by {@link assignPersonColours}.
 * @param name - The person's name.
 * @returns Their series colour, or the muted colour when they have none.
 */
export function colourOfPerson(personColours: PersonColours, name: string): string {
  return personColours.get(name) ?? OTHER_PEOPLE_COLOUR;
}

/**
 * Draws the small coloured square that precedes a name in legends and tables.
 *
 * @param colour - A CSS colour. It is escaped, although every caller passes a
 *   colour from this module.
 * @returns An `<i class="colour-swatch">` element as markup.
 */
export function renderColourSwatch(colour: string): SafeHtml {
  return html`<i class="colour-swatch" style="background:${escapeHtml(colour)}"></i>`;
}

/**
 * Draws a person's swatch followed by their escaped name.
 *
 * @param personColours - The assignment made by {@link assignPersonColours}.
 * @param name - The person's name.
 * @returns The swatch and the name as markup.
 */
export function renderSwatchAndName(personColours: PersonColours, name: string): SafeHtml {
  const swatch = renderColourSwatch(colourOfPerson(personColours, name));
  return html`${swatch}${escapeHtml(name)}`;
}
