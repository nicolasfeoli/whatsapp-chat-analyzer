// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { assignPersonColours } from '../../../src/ui/person-colours';
import { renderReplyPairsSection, replyCountBetween } from '../../../src/ui/sections/reply-pairs';
import type { ChatAnalysis } from '../../../src/core/types';
import { chatAnalysis, personStatistics } from '../../fixtures/analysis-builders';
import { findElement, parseMarkup, tagNamesIn, textsOfElements } from '../../fixtures/markup';

/**
 * Renders the section for an analysis and parses it.
 */
function renderSection(analysis: ChatAnalysis): HTMLDivElement {
  return parseMarkup(renderReplyPairsSection(analysis, assignPersonColours(analysis.people)));
}

/**
 * Reads the grid as rows of cell texts, the row heading first.
 */
function readGridRows(section: ParentNode): string[][] {
  return Array.from(section.querySelectorAll('.person-grid tbody tr'), (row) =>
    textsOfElements(row, 'th, td'),
  );
}

/**
 * Reads the inline style of every cell of one row of the grid, in column order.
 */
function cellStylesOfRow(section: ParentNode, rowIndex: number): (string | null)[] {
  const row = section.querySelectorAll('.person-grid tbody tr')[rowIndex];
  if (row === undefined) {
    throw new Error(`The grid has no row ${rowIndex}`);
  }
  return Array.from(row.querySelectorAll('td'), (cell) => cell.getAttribute('style'));
}

/** Ana mostly answers Bob, Bob mostly answers Ana, and Carla only ever answers Ana. */
const threeFriends = chatAnalysis({
  people: [
    personStatistics({
      name: 'Ana',
      messageCount: 60,
      replyCountsByRecipient: new Map([
        ['Bob', 1200],
        ['Carla', 300],
      ]),
    }),
    personStatistics({
      name: 'Bob',
      messageCount: 40,
      replyCountsByRecipient: new Map([
        ['Carla', 5],
        ['Ana', 20],
      ]),
    }),
    personStatistics({
      name: 'Carla',
      messageCount: 20,
      replyCountsByRecipient: new Map([['Ana', 7]]),
    }),
  ],
});

describe('replyCountBetween', () => {
  it('returns how often one person replied to another', () => {
    const ana = personStatistics({ name: 'Ana', replyCountsByRecipient: new Map([['Bob', 3]]) });

    expect(replyCountBetween(ana, 'Bob')).toBe(3);
  });

  it('returns zero for somebody the person never replied to', () => {
    const ana = personStatistics({ name: 'Ana', replyCountsByRecipient: new Map([['Bob', 3]]) });

    expect(replyCountBetween(ana, 'Carla')).toBe(0);
  });
});

describe('renderReplyPairsSection', () => {
  describe('when there is nothing to compare', () => {
    it('is left out of a chat of two, where each can only answer the other', () => {
      const couple = chatAnalysis({
        people: [
          personStatistics({ name: 'Ana', replyCountsByRecipient: new Map([['Bob', 9]]) }),
          personStatistics({ name: 'Bob', replyCountsByRecipient: new Map([['Ana', 9]]) }),
        ],
      });

      expect(renderReplyPairsSection(couple, assignPersonColours(couple.people))).toBe('');
    });

    it('is left out of a group in which nobody replied to anybody', () => {
      const strangers = chatAnalysis({
        people: [
          personStatistics({ name: 'Ana', messageCount: 3 }),
          personStatistics({ name: 'Bob', messageCount: 2 }),
          personStatistics({ name: 'Carla', messageCount: 1 }),
        ],
      });

      expect(renderReplyPairsSection(strangers, assignPersonColours(strangers.people))).toBe('');
    });
  });

  describe('the grid', () => {
    it('is headed "Who answers whom" and says how a reply is attributed', () => {
      const section = renderSection(threeFriends);

      expect(textsOfElements(section, '.section-heading h2')).toEqual(['Who answers whom']);
      expect(findElement(section, '.section-heading p').textContent).toContain(
        'a reply counts towards whoever wrote just before it',
      );
    });

    it('has a column for each person, most active first', () => {
      const section = renderSection(threeFriends);

      expect(textsOfElements(section, '.person-grid thead th')).toEqual(['Ana', 'Bob', 'Carla']);
    });

    it('has a row for each person with their replies to each of the others', () => {
      expect(readGridRows(renderSection(threeFriends))).toEqual([
        ['Ana', '·', '1,200', '300'],
        ['Bob', '20', '·', '5'],
        ['Carla', '7', '0', '·'],
      ]);
    });

    it('marks the headings as row and column headings for screen readers', () => {
      const section = renderSection(threeFriends);
      const scopesOf = (selector: string): (string | null)[] =>
        Array.from(section.querySelectorAll(selector), (heading) => heading.getAttribute('scope'));

      expect(scopesOf('.person-grid thead th')).toEqual(['col', 'col', 'col']);
      expect(scopesOf('.person-grid tbody th')).toEqual(['row', 'row', 'row']);
    });

    it('repeats the full name of every heading in its title, because long names are cut short', () => {
      const section = renderSection(threeFriends);
      const titlesOf = (selector: string): (string | null)[] =>
        Array.from(section.querySelectorAll(selector), (heading) => heading.getAttribute('title'));

      expect(titlesOf('.person-grid thead th')).toEqual(['Ana', 'Bob', 'Carla']);
      expect(titlesOf('.person-grid tbody th')).toEqual(['Ana', 'Bob', 'Carla']);
    });

    it('puts the colour of each person before their name in the row heading', () => {
      const section = renderSection(threeFriends);

      expect(section.querySelectorAll('.person-grid tbody th .colour-swatch')).toHaveLength(3);
    });

    it('scrolls sideways on a narrow screen instead of widening the page', () => {
      const section = renderSection(threeFriends);

      expect(findElement(section, '.person-grid').parentElement?.className).toBe('table-wrapper');
    });
  });

  describe('the tint of the cells', () => {
    it('is strongest for the person each row answers most', () => {
      const section = renderSection(threeFriends);

      expect(cellStylesOfRow(section, 0)).toEqual([
        null,
        'background:color-mix(in oklab,var(--accent) 40%,transparent)',
        'background:color-mix(in oklab,var(--accent) 15%,transparent)',
      ]);
    });

    it('is scaled within each row, so a quiet person still shows whom they answer most', () => {
      const section = renderSection(threeFriends);

      expect(cellStylesOfRow(section, 2)[0]).toBe(
        'background:color-mix(in oklab,var(--accent) 40%,transparent)',
      );
    });

    it('is absent from a cell without replies and from the cell of a person with themselves', () => {
      const section = renderSection(threeFriends);

      expect(cellStylesOfRow(section, 2)).toEqual([expect.any(String), null, null]);
    });
  });

  describe('a large group', () => {
    const names = ['Ana', 'Bob', 'Carla', 'Dani', 'Eva', 'Fede', 'Gabi', 'Hugo', 'Ines', 'Juan'];
    const largeGroup = chatAnalysis({
      people: names.map((name, index) =>
        personStatistics({
          name,
          messageCount: 100 - index,
          replyCountsByRecipient: new Map([['Ana', 2]]),
        }),
      ),
    });

    it('shows the eight most active people and leaves the rest out', () => {
      const section = renderSection(largeGroup);

      expect(textsOfElements(section, '.person-grid thead th')).toEqual(names.slice(0, 8));
      expect(section.querySelectorAll('.person-grid tbody tr')).toHaveLength(8);
    });

    it('is left out when the only replies went to people who are not shown', () => {
      const repliesToTheTail = chatAnalysis({
        people: names.map((name, index) =>
          personStatistics({
            name,
            messageCount: 100 - index,
            replyCountsByRecipient: new Map([['Juan', 2]]),
          }),
        ),
      });

      expect(
        renderReplyPairsSection(repliesToTheTail, assignPersonColours(repliesToTheTail.people)),
      ).toBe('');
    });
  });

  describe('names that are markup', () => {
    const hostileName = '<img src=x onerror=alert(1)>';
    const quoteBreakingName = 'Bob" onmouseover="alert(2)" x="';
    const hostileGroup = chatAnalysis({
      people: [
        personStatistics({
          name: hostileName,
          messageCount: 3,
          replyCountsByRecipient: new Map([[quoteBreakingName, 4]]),
        }),
        personStatistics({
          name: quoteBreakingName,
          messageCount: 2,
          replyCountsByRecipient: new Map([[hostileName, 2]]),
        }),
        personStatistics({ name: 'Carla', messageCount: 1 }),
      ],
    });

    it('arrive on the page as text and create no element', () => {
      const section = renderSection(hostileGroup);

      expect(tagNamesIn(section)).not.toContain('img');
      expect(textsOfElements(section, '.person-grid thead th')).toEqual([
        hostileName,
        quoteBreakingName,
        'Carla',
      ]);
    });

    it('cannot break out of the title attribute', () => {
      const section = renderSection(hostileGroup);
      const secondHeading = section.querySelectorAll('.person-grid thead th')[1];

      const secondRowHeading = section.querySelectorAll('.person-grid tbody th')[1];

      expect(secondHeading?.getAttribute('title')).toBe(quoteBreakingName);
      expect(secondHeading?.hasAttribute('onmouseover')).toBe(false);
      expect(secondRowHeading?.getAttribute('title')).toBe(quoteBreakingName);
      expect(secondRowHeading?.hasAttribute('onmouseover')).toBe(false);
    });
  });
});
