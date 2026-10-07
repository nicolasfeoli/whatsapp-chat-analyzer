// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import type { ChatAnalysis } from '../../../src/core/types';
import { assignPersonColours } from '../../../src/ui/person-colours';
import { renderAwardsSection } from '../../../src/ui/sections/awards';
import type { PeopleShown } from '../../../src/ui/sections/featured-people';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis, peopleShown?: PeopleShown): HTMLDivElement {
  return parseMarkup(
    renderAwardsSection(analysis, assignPersonColours(analysis.people), peopleShown),
  );
}

/**
 * Reads the awards as rows of title, winner and reason.
 */
function readAwards(section: ParentNode): string[][] {
  return Array.from(section.querySelectorAll('.awards li'), (award) =>
    textsOfElements(award, 'span'),
  );
}

/** Ana writes at night and sends the photos; Bob opens the conversations. */
const anaAndBob = chatAnalysis({
  conversationCount: 30,
  people: [
    personStatistics({
      name: 'Ana',
      messageCount: 200,
      nightMessageCount: 50,
      conversationsStartedCount: 9,
      mediaCountsByType: new Map([['photo', 12]]),
    }),
    personStatistics({
      name: 'Bob',
      messageCount: 100,
      nightMessageCount: 5,
      conversationsStartedCount: 21,
    }),
  ],
});

describe('renderAwardsSection', () => {
  it('is left out of a chat with a single sender, who would win everything', () => {
    const monologue = chatAnalysis({
      people: [personStatistics({ name: 'Ana', messageCount: 200, nightMessageCount: 50 })],
    });

    expect(renderAwardsSection(monologue, assignPersonColours(monologue.people))).toBe('');
  });

  it('is left out when nobody qualifies for a title', () => {
    const smallChat = chatAnalysis({
      people: [
        personStatistics({ name: 'Ana', messageCount: 3 }),
        personStatistics({ name: 'Bob', messageCount: 2 }),
      ],
    });

    expect(renderAwardsSection(smallChat, assignPersonColours(smallChat.people))).toBe('');
  });

  it('is headed "Awards" and says it is meant in good fun', () => {
    const section = renderSection(anaAndBob);

    expect(textsOfElements(section, '.section-heading h2')).toEqual(['Awards']);
    expect(findElement(section, '.section-heading p').textContent).toContain('All in good fun');
  });

  it('gives each title to one person, with the number that earned it', () => {
    expect(readAwards(renderSection(anaAndBob))).toEqual([
      ['The night owl', 'Ana', '25% of their messages are sent between midnight and 5:00'],
      ['The opener', 'Bob', 'started 21 of the 30 conversations'],
      ['The photographer', 'Ana', '12 photos sent'],
    ]);
  });

  it('draws the winner with the colour they have in the charts', () => {
    const swatches = Array.from(
      renderSection(anaAndBob).querySelectorAll('.award-winner .colour-swatch'),
      (swatch) => swatch.getAttribute('style'),
    );

    expect(swatches).toEqual([
      'background:var(--s1)',
      'background:var(--s2)',
      'background:var(--s1)',
    ]);
  });

  it('says how a title is given and who takes a tie', () => {
    const hints = textsOfElements(renderSection(anaAndBob), 'p.hint');

    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain('only when there is enough to go on');
    expect(hints[0]).toContain('the one who wrote more messages takes it');
  });

  describe('in a group larger than the report lists', () => {
    /** Ten people; only the tenth writes at night. */
    const largeGroup = chatAnalysis({
      people: Array.from({ length: 10 }, (_unused, index) =>
        personStatistics({
          name: `Person ${String(index + 1)}`,
          messageCount: 1000 - index * 100,
          nightMessageCount: index === 9 ? 60 : 0,
          conversationsStartedCount: 10 - index,
        }),
      ),
      conversationCount: 55,
    });

    it('lets the most active compete, and says so', () => {
      const section = renderSection(largeGroup);

      expect(readAwards(section).map(([title]) => title)).toEqual(['The opener']);
      expect(textsOfElements(section, '.people-shown-note')).toEqual([
        'Showing the 8 most active of 10 people.',
      ]);
    });

    it('lets everyone compete when asked to', () => {
      const section = renderSection(largeGroup, 'everyone');

      expect(readAwards(section).map(([title, winner]) => `${title}: ${winner}`)).toEqual([
        'The night owl: Person 10',
        'The opener: Person 1',
      ]);
      expect(textsOfElements(section, '.people-shown-note')).toEqual([]);
    });
  });

  it('writes a name that is markup as text', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const hostileChat = chatAnalysis({
      people: [
        personStatistics({ name: hostileName, messageCount: 200, nightMessageCount: 50 }),
        personStatistics({ name: 'Bob', messageCount: 100 }),
      ],
    });

    const section = renderSection(hostileChat);

    expect(tagNamesIn(section)).not.toContain('img');
    expect(readAwards(section)[0]?.[1]).toBe(hostileName);
  });
});
